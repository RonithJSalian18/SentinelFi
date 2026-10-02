"""
Job status fan-out between the analysis workers and WebSocket clients.

With REDIS_URL set, events travel over Redis pub/sub, so a Celery worker running in a
separate process (or on a separate machine) can notify the API server. Without Redis,
an in-process broker is used, which works for single-process local development.
"""
import asyncio
import json
import os
import threading
from contextlib import asynccontextmanager
from typing import AsyncIterator, Awaitable, Callable, Optional

from dotenv import load_dotenv

load_dotenv()

REDIS_URL = os.getenv("REDIS_URL")

NextEvent = Callable[[float], Awaitable[Optional[dict]]]


def _channel(job_id: str) -> str:
    return f"sentinelfi:jobs:{job_id}"


class _LocalBroker:
    def __init__(self):
        self._lock = threading.Lock()
        self._subscribers: dict[str, set[tuple[asyncio.AbstractEventLoop, asyncio.Queue]]] = {}

    def subscribe(self, job_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        with self._lock:
            self._subscribers.setdefault(job_id, set()).add((asyncio.get_running_loop(), queue))
        return queue

    def unsubscribe(self, job_id: str, queue: asyncio.Queue) -> None:
        with self._lock:
            subs = self._subscribers.get(job_id, set())
            subs.difference_update({s for s in subs if s[1] is queue})
            if not subs:
                self._subscribers.pop(job_id, None)

    def publish(self, job_id: str, payload: dict) -> None:
        # Called from worker threads, so hand the event to each subscriber's own event loop.
        with self._lock:
            subs = list(self._subscribers.get(job_id, ()))
        for loop, queue in subs:
            loop.call_soon_threadsafe(queue.put_nowait, payload)


_local_broker = _LocalBroker()
_redis_client = None


def publish(job_id: str, payload: dict) -> None:
    """Synchronously broadcast a job status update. Safe to call from any thread or process."""
    global _redis_client
    if REDIS_URL:
        import redis
        if _redis_client is None:
            _redis_client = redis.Redis.from_url(REDIS_URL)
        _redis_client.publish(_channel(job_id), json.dumps(payload, default=str))
    else:
        _local_broker.publish(job_id, payload)


@asynccontextmanager
async def subscribe(job_id: str) -> AsyncIterator[NextEvent]:
    """Yield an awaitable `next_event(timeout)` that returns the next update, or None on timeout."""
    if REDIS_URL:
        import redis.asyncio as aioredis
        client = aioredis.Redis.from_url(REDIS_URL)
        pubsub = client.pubsub()
        await pubsub.subscribe(_channel(job_id))

        async def next_event(timeout: float) -> Optional[dict]:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=timeout)
            return json.loads(message["data"]) if message else None

        try:
            yield next_event
        finally:
            await pubsub.unsubscribe(_channel(job_id))
            await pubsub.aclose()
            await client.aclose()
    else:
        queue = _local_broker.subscribe(job_id)

        async def next_event(timeout: float) -> Optional[dict]:
            try:
                return await asyncio.wait_for(queue.get(), timeout)
            except asyncio.TimeoutError:
                return None

        try:
            yield next_event
        finally:
            _local_broker.unsubscribe(job_id, queue)

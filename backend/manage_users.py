"""
User administration from the command line.

    python manage_users.py create --email admin@bank.com --name "Jane Doe" --role admin
    python manage_users.py list
"""
import argparse
import getpass
import sys

from pydantic import ValidationError

import models
from auth import Role, create_user_record
from database import SessionLocal, sync_schema


def main():
    parser = argparse.ArgumentParser(description="Manage SentinelFi users.")
    commands = parser.add_subparsers(dest="command", required=True)

    create = commands.add_parser("create", help="create a user")
    create.add_argument("--email", required=True)
    create.add_argument("--name", required=True)
    create.add_argument("--role", choices=[r.value for r in Role], default=Role.ANALYST.value)
    create.add_argument("--password", help="omit to be prompted (recommended)")

    commands.add_parser("list", help="list users")
    args = parser.parse_args()

    sync_schema()
    db = SessionLocal()
    try:
        if args.command == "create":
            password = args.password or getpass.getpass("Password (min 12 characters): ")
            if db.query(models.User).filter(models.User.email == args.email.strip().lower()).first():
                sys.exit(f"User {args.email} already exists.")
            try:
                user = create_user_record(db, args.email, args.name, password, Role(args.role))
            except ValidationError as e:
                sys.exit("Invalid input: " + "; ".join(f"{err['loc'][0]}: {err['msg']}" for err in e.errors()))
            print(f"Created {user.role} {user.email} (id {user.id})")
        else:
            for user in db.query(models.User).order_by(models.User.id):
                status = "active" if user.is_active else "disabled"
                print(f"{user.id:>4}  {user.role:<8} {status:<9} {user.email}  ({user.full_name})")
    finally:
        db.close()


if __name__ == "__main__":
    main()

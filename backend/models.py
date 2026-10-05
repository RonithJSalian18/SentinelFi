import uuid

from sqlalchemy import Boolean, Column, Integer, String, Float, DateTime, ForeignKey, JSON, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class User(Base):
    """Bank personnel allowed into SentinelFi. role: 'analyst' (Compliance Analyst) or 'admin' (System Admin)."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)  # stored lower-case
    full_name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False, default="analyst")
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login_at = Column(DateTime(timezone=True))


class CorporateEntity(Base):
    __tablename__ = "corporate_entities"

    id = Column(Integer, primary_key=True, index=True)
    company_name = Column(String, index=True, nullable=False)
    registration_number = Column(String, unique=True, index=True, nullable=False)
    country_of_incorporation = Column(String)
    ai_risk_score = Column(Float, default=0.0)
    document_key = Column(String)  # object-store key of the latest source filing
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    owners = relationship("BeneficialOwner", back_populates="company")

class BeneficialOwner(Base):
    __tablename__ = "beneficial_owners"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("corporate_entities.id"), nullable=False)
    owner_name = Column(String, nullable=False)
    ownership_percentage = Column(Float, nullable=False)
    
    company = relationship("CorporateEntity", back_populates="owners")

class TransactionLedger(Base):
    __tablename__ = "transaction_ledgers"

    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey("corporate_entities.id"), nullable=False)
    receiver_id = Column(Integer, ForeignKey("corporate_entities.id"), nullable=False)
    amount = Column(Float, nullable=False)
    currency = Column(String, default="USD")
    transaction_date = Column(DateTime(timezone=True), server_default=func.now())


class DocumentJob(Base):
    """Tracks an asynchronous document analysis from upload to completion."""
    __tablename__ = "document_jobs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    filename = Column(String, nullable=False)
    bank_name = Column(String, nullable=False)
    status = Column(String, nullable=False, default="queued", index=True)  # queued | processing | completed | failed
    result = Column(JSON)
    error = Column(Text)
    entity_id = Column(Integer, ForeignKey("corporate_entities.id"))
    document_key = Column(String)       # object-store key of the original PDF
    document_sha256 = Column(String(64))
    document_size = Column(Integer)
    submitted_by_id = Column(Integer, ForeignKey("users.id"))  # audit: who uploaded the filing
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True))

    submitted_by = relationship("User")

    def to_payload(self) -> dict:
        return {
            "job_id": self.id,
            "status": self.status,
            "filename": self.filename,
            "tenant": self.bank_name,
            "analysis": self.result,
            "error": self.error,
            "document_available": self.document_key is not None,
            "document_sha256": self.document_sha256,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class CorporateEntity(Base):
    __tablename__ = "corporate_entities"

    id = Column(Integer, primary_key=True, index=True)
    company_name = Column(String, index=True, nullable=False)
    registration_number = Column(String, unique=True, index=True, nullable=False)
    country_of_incorporation = Column(String)
    ai_risk_score = Column(Float, default=0.0)
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
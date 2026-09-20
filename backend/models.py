from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.sql import func
from database import Base

class CorporateEntity(Base):
    __tablename__ = "corporate_entities"

    id = Column(Integer, primary_key=True, index=True)
    company_name = Column(String, index=True, nullable=False)
    registration_number = Column(String, unique=True, index=True, nullable=False)
    country_of_incorporation = Column(String)
    
    # This will hold the AI-generated risk score
    ai_risk_score = Column(Float, default=0.0)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
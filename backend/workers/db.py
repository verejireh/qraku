"""Sync DB session for Dramatiq workers (aiomysql → pymysql 치환)."""
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

_url = os.environ["DATABASE_URL"].replace("mysql+aiomysql://", "mysql+pymysql://")
engine = create_engine(_url, pool_pre_ping=True, pool_size=5, max_overflow=10)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

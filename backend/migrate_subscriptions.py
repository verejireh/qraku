import asyncio
import sqlite3
from database import DATABASE_URL

async def migrate_subscriptions():
    db_path = DATABASE_URL.replace("sqlite+aiosqlite:///", "")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Add subscription_type
        cursor.execute("ALTER TABLE store ADD COLUMN subscription_type VARCHAR DEFAULT 'FREE'")
    except sqlite3.OperationalError:
        print("subscription_type column already exists")

    try:
        # Add subscription_status
        cursor.execute("ALTER TABLE store ADD COLUMN subscription_status VARCHAR DEFAULT 'TRIAL'")
    except sqlite3.OperationalError:
        print("subscription_status column already exists")

    try:
        # Add subscription_expires_at
        cursor.execute("ALTER TABLE store ADD COLUMN subscription_expires_at DATETIME")
    except sqlite3.OperationalError:
        print("subscription_expires_at column already exists")

    # Update existing stores to have a trial if they don't have one
    from datetime import datetime, timedelta
    trial_end = (datetime.utcnow() + timedelta(days=30)).isoformat()
    cursor.execute(f"UPDATE store SET subscription_status = 'TRIAL', subscription_expires_at = '{trial_end}' WHERE subscription_expires_at IS NULL")
    
    conn.commit()
    conn.close()
    print("Migration complete: Subscription fields added.")

if __name__ == "__main__":
    asyncio.run(migrate_subscriptions())

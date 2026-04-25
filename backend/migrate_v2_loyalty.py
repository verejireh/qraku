import asyncio
import sqlite3
from database import DATABASE_URL

async def migrate_advanced_loyalty():
    db_path = DATABASE_URL.replace("sqlite+aiosqlite:///", "")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print(f"Connecting to {db_path}...")

    # 1. Update Store table with point settings
    try:
        cursor.execute("ALTER TABLE store ADD COLUMN points_enabled BOOLEAN DEFAULT 0")
    except sqlite3.OperationalError:
        print("points_enabled column already exists.")

    try:
        cursor.execute("ALTER TABLE store ADD COLUMN point_rate FLOAT DEFAULT 1.0")
        print("Added point settings to store table.")
    except sqlite3.OperationalError:
        print("point_rate column already exists.")

    # 2. Create CustomerPoint table for isolation
    try:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS customerpoint (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id VARCHAR NOT NULL,
                store_id INTEGER NOT NULL,
                balance INTEGER DEFAULT 0,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(customer_id) REFERENCES customer(id),
                FOREIGN KEY(store_id) REFERENCES store(id)
            )
        """)
        print("Ensured customerpoint table exists.")
    except sqlite3.OperationalError as e:
        print(f"Error creating customerpoint: {e}")

    # 3. Create PointHistory table for transaction logging
    try:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS pointhistory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id VARCHAR NOT NULL,
                store_id INTEGER NOT NULL,
                amount INTEGER NOT NULL,
                tx_type VARCHAR NOT NULL,
                description VARCHAR,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(customer_id) REFERENCES customer(id),
                FOREIGN KEY(store_id) REFERENCES store(id)
            )
        """)
        print("Ensured pointhistory table exists.")
    except sqlite3.OperationalError as e:
        print(f"Error creating pointhistory: {e}")

    # 4. Create GlobalReview table (using "order" escaped)
    try:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS globalreview (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                store_id INTEGER NOT NULL,
                order_id INTEGER NOT NULL,
                customer_id VARCHAR NOT NULL,
                rating FLOAT DEFAULT 5.0,
                tags VARCHAR DEFAULT '{}',
                comment VARCHAR,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(store_id) REFERENCES store(id),
                FOREIGN KEY(order_id) REFERENCES "order"(id),
                FOREIGN KEY(customer_id) REFERENCES customer(id)
            )
        """)
        print("Ensured globalreview table exists.")
    except sqlite3.OperationalError as e:
        print(f"Error creating globalreview: {e}")

    conn.commit()
    conn.close()
    print("Advanced Loyalty & Global Review migration complete.")

if __name__ == "__main__":
    asyncio.run(migrate_advanced_loyalty())

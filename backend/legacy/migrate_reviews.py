import asyncio
import sqlite3
from database import DATABASE_URL

async def migrate_loyalty():
    db_path = DATABASE_URL.replace("sqlite+aiosqlite:///", "")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        cursor.execute("ALTER TABLE customer ADD COLUMN total_points INTEGER DEFAULT 0")
    except sqlite3.OperationalError:
        print("total_points column already exists")

    try:
        cursor.execute("ALTER TABLE table ADD COLUMN last_order_id INTEGER")
    except sqlite3.OperationalError:
        print("last_order_id column already exists")

    # Create Review Table
    try:
        cursor.execute("""
            CREATE TABLE review (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                store_id INTEGER NOT NULL,
                order_id INTEGER NOT NULL,
                customer_id VARCHAR NOT NULL,
                rating FLOAT DEFAULT 5.0,
                tags VARCHAR DEFAULT '{}',
                comment VARCHAR,
                created_at DATETIMEDEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(store_id) REFERENCES store(id),
                FOREIGN KEY(order_id) REFERENCES order(id),
                FOREIGN KEY(customer_id) REFERENCES customer(id)
            )
        """)
    except sqlite3.OperationalError:
        print("review table already exists")

    conn.commit()
    conn.close()
    print("Migration complete: Reviews and Loyalty fields ready.")

if __name__ == "__main__":
    asyncio.run(migrate_loyalty())

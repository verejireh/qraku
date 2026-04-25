import asyncio
import sqlite3
from database import DATABASE_URL

async def migrate_table_status():
    db_path = DATABASE_URL.replace("sqlite+aiosqlite:///", "")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        cursor.execute("ALTER TABLE table ADD COLUMN status VARCHAR DEFAULT 'ORDERING'")
    except sqlite3.OperationalError:
        print("status column already exists or table name conflict")

    conn.commit()
    conn.close()
    print("Migration complete: Table status field added.")

if __name__ == "__main__":
    asyncio.run(migrate_table_status())

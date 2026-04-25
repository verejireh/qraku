import asyncio
import sqlite3
from database import DATABASE_URL

async def migrate_geofence():
    db_path = DATABASE_URL.replace("sqlite+aiosqlite:///", "")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        cursor.execute("ALTER TABLE store ADD COLUMN latitude FLOAT")
    except sqlite3.OperationalError:
        print("latitude column already exists")

    try:
        cursor.execute("ALTER TABLE store ADD COLUMN longitude FLOAT")
    except sqlite3.OperationalError:
        print("longitude column already exists")

    try:
        cursor.execute("ALTER TABLE store ADD COLUMN geofence_enabled BOOLEAN DEFAULT 0")
    except sqlite3.OperationalError:
        print("geofence_enabled column already exists")

    conn.commit()
    conn.close()
    print("Migration complete: Geofence fields added.")

if __name__ == "__main__":
    asyncio.run(migrate_geofence())

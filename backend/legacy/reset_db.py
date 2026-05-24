import os
import asyncio
from database import init_db
from init_data import create_initial_data

# The actual file is usually in the working directory or specified path.
# In database.py: DATABASE_URL = "sqlite+aiosqlite:///./qr.db"
# So it's 'qr.db' in backend/ directory.
DB_FILE = "f:/myproject/orderservice/backend/qr_v6.db"

async def reset_db():
    if os.path.exists(DB_FILE):
        try:
            os.remove(DB_FILE)
            print(f"Deleted {DB_FILE}")
        except PermissionError:
            print(f"Error: Cannot delete {DB_FILE}. File is in use.")
            return

    print("Re-creating data...")
    # create_initial_data calls init_db() inside it
    await create_initial_data()

if __name__ == "__main__":
    asyncio.run(reset_db())

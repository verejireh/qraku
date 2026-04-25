import requests
import uuid
import json

BASE_URL = "http://localhost:8002"

def test_api():
    # 0. Check Stores
    print("Checking Stores...")
    res = requests.get(f"{BASE_URL}/stores/")
    print(f"Store Response: {res.text}")
    stores = res.json()
    store_id = 1
    if len(stores) > 0:
        store_id = stores[0]['id']
        print(f"Using Store ID: {store_id}")

    # 1. Check Menus
    print("Checking Menus...")
    res = requests.get(f"{BASE_URL}/menus/{store_id}")
    print(f"Status: {res.status_code}")
    print(f"Content: {res.text}")
    
    menus = res.json()
    if isinstance(menus, list) and len(menus) > 0:
        print(f"Menus count: {len(menus)}")
        print(f"First menu desc (KR): {menus[0].get('description_ko')}")
    else:
        print("No menus found or error response.")

    # 2. Create Order with UUID
    print("\nCreating Order...")
    customer_uuid = str(uuid.uuid4())
    headers = {"X-Customer-UUID": customer_uuid}
    
    order_data = {
        "table_id": 1,
        "customer_id": customer_uuid, # Fallback
        "items": [
            {"menu_id": menus[0]['id'], "quantity": 2},
            {"menu_id": menus[1]['id'], "quantity": 1}
        ]
    }
    
    res = requests.post(f"{BASE_URL}/orders/", json=order_data, headers=headers)
    if res.status_code == 200:
        order = res.json()
        print(f"Order Created! ID: {order['id']}, Total: {order['total_price']}")
    else:
        print(f"Order Failed: {res.text}")

    # 3. Check Stats
    print("\nChecking Stats...")
    res = requests.get(f"{BASE_URL}/stats/daily-sales")
    print(f"Daily Sales: {res.json()}")
    
    res = requests.get(f"{BASE_URL}/stats/top-customers")
    customers = res.json()
    print(f"Top Customers: {len(customers)}")
    if len(customers) > 0:
        print(f"Top 1 Visit Count: {customers[0]['visit_count']}")

if __name__ == "__main__":
    test_api()

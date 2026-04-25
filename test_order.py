import requests

# 1. Open the table (using table.id)
res = requests.post("http://35.213.6.149:8003/api/staff/tables/1/open")
print("Open Table Response:", res.status_code, res.text)

# 2. Join the table using shop_id (slug) and table.id (from the URL /1234568/table/1)
# Looking at the frontend URL: http://localhost:5173/1234568/table/1
# "1234568" is the test-store-1 slug. So the JSON should be {"shop_id": "1234568"}
res = requests.post(
    "http://35.213.6.149:8003/api/customer/tables/1/join",
    json={"shop_id": "1234568"}
)
print("Join Table Response:", res.status_code, res.text)

if res.status_code == 200:
    session_token = res.json().get("session_token")
    
    # 3. Create the order
    order_data = {
      "shop_id": "1234568",
      "table_number": 1,
      "session_token": session_token,
      "items": [{"menu_item_id": "1", "quantity": 1}]
    }
    
    order_res = requests.post(
        "http://35.213.6.149:8003/api/orders/",
        json=order_data
    )
    print("Order Response:", order_res.status_code, order_res.text)
else:
    print("Failed to join table.")


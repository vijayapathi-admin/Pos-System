import os
from flask import Flask, jsonify
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore
import pandas as pd
from statsmodels.tsa.arima.model import ARIMA
import datetime
import warnings
from statsmodels.tools.sm_exceptions import ConvergenceWarning
warnings.simplefilter('ignore', ConvergenceWarning)

app = Flask(__name__)
CORS(app)

# Initialize Firebase Admin
try:
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    service_key_path = os.path.join(backend_dir, "serviceAccountKey.json")
    cred = credentials.Certificate(service_key_path)
    firebase_admin.initialize_app(cred)
    db = firestore.client()
except Exception as e:
    print(f"Error initializing Firebase Admin: {e}")
    db = None

@app.route('/predict', methods=['GET'])
def predict_demand():
    if not db:
        return jsonify({"error": "Firebase Admin not initialized. Check serviceAccountKey.json"}), 500

    try:
        sales_ref = db.collection('sales')
        docs = sales_ref.stream()

        # Extract data
        records = []
        for doc in docs:
            data = doc.to_dict()
            date_str = data.get('date')
            if not date_str:
                continue
            
            items = data.get('items', [])
            for item in items:
                product_id = item.get('productId')
                qty = item.get('qty', 0)
                if product_id and qty > 0:
                    records.append({
                        'date': date_str,
                        'productId': product_id,
                        'quantity': qty
                    })
        
        if not records:
            return jsonify({"message": "No sales data found", "data": {}}), 200

        df = pd.DataFrame(records)
        df['date'] = pd.to_datetime(df['date'])
        
        # Aggregate daily sales per product
        daily_sales = df.groupby(['productId', 'date'])['quantity'].sum().reset_index()

        today = datetime.date.today()
        future_dates = [(today + datetime.timedelta(days=i)).strftime('%Y-%m-%d') for i in range(1, 8)]

        predictions = {}

        for product_id, group in daily_sales.groupby('productId'):
            # Set date as index, resample to daily to fill missing dates with 0
            group = group.set_index('date').resample('D').sum().fillna(0)
            
            y = group['quantity'].values
            
            forecast_values = []
            
            if len(y) < 7:
                # Fallback: simple average
                avg_qty = max(0, y.mean() if len(y) > 0 else 0)
                forecast_values = [avg_qty] * 7
            else:
                try:
                    # Basic ARIMA model (p=1, d=0, q=1). Can be tuned.
                    model = ARIMA(y, order=(1, 0, 1))
                    model_fit = model.fit()
                    forecast = model_fit.forecast(steps=7)
                    forecast_values = [max(0, val) for val in forecast] # No negative demand
                except Exception as e:
                    print(f"ARIMA failed for {product_id}, falling back to average: {e}")
                    avg_qty = max(0, y.mean())
                    forecast_values = [avg_qty] * 7

            # Prepare structured response
            product_predictions = []
            total_7_days = 0
            peak_val = -1
            peak_date = ""

            for i, val in enumerate(forecast_values):
                pred_qty = round(val, 2)
                d_str = future_dates[i]
                product_predictions.append({
                    "date": d_str,
                    "predicted": pred_qty
                })
                total_7_days += pred_qty
                if pred_qty > peak_val:
                    peak_val = pred_qty
                    peak_date = d_str

            predictions[product_id] = {
                "forecast": product_predictions,
                "peakDay": peak_date,
                "peakValue": peak_val,
                "totalPredictedDemand": round(total_7_days, 2)
            }

        return jsonify({"message": "Success", "data": predictions}), 200

    except Exception as e:
        print(f"Error predicting demand: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/sync_excel', methods=['POST', 'GET'])
def sync_excel():
    if not db:
        return jsonify({"error": "Firebase Admin client not initialized."}), 500

    try:
        products_ref = db.collection('products')
        docs = products_ref.stream()

        records = []
        for doc in docs:
            data = doc.to_dict()
            records.append({
                'Product Code': data.get('productCode', ''),
                'Product Name': data.get('name', ''),
                'Category': data.get('category', 'Hardware'),
                'Purchase Price (INR)': data.get('purchasePrice', 0.0),
                'Selling Price (INR)': data.get('sellingPrice', 0.0),
                'Stock': data.get('stock', 0.0),
                'Unit': data.get('unit', 'Nos'),
                'Total Sold': data.get('totalSold', 0.0),
                'Supplier': data.get('supplier', ''),
                'HSN Code': data.get('hsnCode', ''),
                'GST Rate (%)': data.get('gstRate', 0.0)
            })

        if not records:
            records = [{
                'Product Code': '', 'Product Name': '', 'Category': '', 
                'Purchase Price (INR)': 0.0, 'Selling Price (INR)': 0.0, 
                'Stock': 0.0, 'Unit': 'Nos', 'Total Sold': 0.0, 
                'Supplier': '', 'HSN Code': '', 'GST Rate (%)': 0.0
            }]

        df = pd.DataFrame(records)

        def get_sheet_name(cat):
            cat_upper = str(cat).strip().upper()
            if cat_upper in ["PLUMBING", "PVC", "CPVC", "UPVC"]:
                name = "PVC Items"
            elif cat_upper == "ELECTRICAL":
                name = "Electrical Items"
            elif cat_upper in ["SANITARY", "SANITARYWARE", "BATHROOM FITTINGS"]:
                name = "Sanitary Items"
            elif cat_upper == "HARDWARE":
                name = "Hardware Items"
            elif cat_upper == "MOTORS":
                name = "Motors Items"
            elif cat_upper == "HOUSE APPLIANCES":
                name = "Appliances Items"
            else:
                name = f"{cat.title()} Items" if cat else "Other Items"
            return name[:31]

        df['Sheet'] = df['Category'].apply(get_sheet_name)

        backend_dir = os.path.dirname(os.path.abspath(__file__))
        root_dir = os.path.dirname(backend_dir)
        excel_path = os.path.join(root_dir, "inventory_master.xlsx")

        with pd.ExcelWriter(excel_path, engine='openpyxl') as writer:
            primary_sheets = ["PVC Items", "Electrical Items", "Sanitary Items", "Hardware Items"]
            grouped = list(df.groupby('Sheet'))
            
            def sort_key(item):
                sheet_name = item[0]
                if sheet_name in primary_sheets:
                    return (0, primary_sheets.index(sheet_name))
                else:
                    return (1, sheet_name)
            
            grouped.sort(key=sort_key)

            for sheet_name, group in grouped:
                clean_group = group.drop(columns=['Sheet'])
                clean_group.sort_values(by='Product Name', inplace=True)
                clean_group.to_excel(writer, sheet_name=sheet_name, index=False)

        return jsonify({"message": "Successfully synchronized inventory to Excel master data.", "path": excel_path}), 200

    except Exception as e:
        print(f"Error syncing excel: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000, debug=True)

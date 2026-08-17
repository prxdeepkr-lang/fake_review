import React, { useEffect, useState } from 'react';
import { api } from '../services/api';

export default function Orders() {
    const [orders, setOrders] = useState([]);

    useEffect(() => {
        api.listOrders().then((res) => setOrders(res.orders));
    }, []);

    return (
        <div>
            <h2>My Orders</h2>
            {orders.length === 0 && <p className="muted">No orders yet.</p>}
            {orders.map((o) => (
                <div key={o.order_id} className="card">
                    <p>
                        Order #{o.order_id} - <span className="badge">{o.status}</span>
                    </p>
                    <p className="muted">{new Date(o.order_date).toLocaleString()}</p>
                    <ul>
                        {o.items.map((item) => (
                            <li key={item.orderItemId}>
                                {item.productName} x{item.quantity} - ${item.price}
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    );
}

import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';

export default function AdminOrders() {
    const [orders, setOrders] = useState([]);
    const [error, setError] = useState('');

    function load() {
        api.listAllOrders()
            .then((res) => setOrders(res.orders))
            .catch((err) => setError(err.message));
    }

    useEffect(load, []);

    async function handleSetStatus(id, status) {
        setError('');
        try {
            await api.setAdminOrderStatus(id, status);
            load();
        } catch (err) {
            setError(err.message);
        }
    }

    return (
        <div>
            <h2>Orders</h2>
            <p className="muted">
                Mark an order DELIVERED once it's fulfilled -- this is what makes a customer's review of that
                product eligible for the "Verified Purchase" tag.
            </p>
            {error && <p className="error">{error}</p>}
            <table>
                <thead>
                    <tr>
                        <th>Order</th>
                        <th>Customer</th>
                        <th>Items</th>
                        <th>Status</th>
                        <th>Placed</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {orders.map((o) => (
                        <tr key={o.order_id}>
                            <td>#{o.order_id}</td>
                            <td>{o.customer_name}</td>
                            <td>
                                {o.items.map((item) => (
                                    <div key={item.orderItemId}>
                                        {item.productName} x{item.quantity}
                                    </div>
                                ))}
                            </td>
                            <td>
                                <span className={`badge ${o.status === 'DELIVERED' ? '' : 'badge-warn'}`}>
                                    {o.status}
                                </span>
                            </td>
                            <td>{new Date(o.order_date).toLocaleString()}</td>
                            <td>
                                {o.status === 'PLACED' && (
                                    <>
                                        <button onClick={() => handleSetStatus(o.order_id, 'DELIVERED')}>
                                            Mark Delivered
                                        </button>
                                        <button className="danger" onClick={() => handleSetStatus(o.order_id, 'CANCELLED')}>
                                            Cancel
                                        </button>
                                    </>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

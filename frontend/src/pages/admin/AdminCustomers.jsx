import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';

export default function AdminCustomers() {
    const [customers, setCustomers] = useState([]);
    const navigate = useNavigate();

    useEffect(() => {
        api.listCustomers().then((res) => setCustomers(res.customers));
    }, []);

    return (
        <div>
            <h2>Customers</h2>
            <p className="muted">Click a customer to see a full breakdown of why they have that risk score.</p>
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Risk Score</th>
                        <th>Status</th>
                        <th>Total Reviews</th>
                        <th>Verified</th>
                        <th>Flagged</th>
                    </tr>
                </thead>
                <tbody>
                    {customers.map((c) => (
                        <tr
                            key={c.customer_id}
                            className="clickable-row"
                            onClick={() => navigate(`/admin/customers/${c.customer_id}`)}
                        >
                            <td>{c.customer_name}</td>
                            <td>{c.email}</td>
                            <td>{c.risk_score}</td>
                            <td>{c.account_status}</td>
                            <td>{c.total_reviews}</td>
                            <td>{c.verified_reviews}</td>
                            <td>{c.flagged_reviews}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

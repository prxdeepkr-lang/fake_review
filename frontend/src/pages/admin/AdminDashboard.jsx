import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';

export default function AdminDashboard() {
    const [data, setData] = useState(null);

    useEffect(() => {
        api.dashboard().then(setData);
    }, []);

    if (!data) return <p>Loading...</p>;
    const { totals, topSuspiciousSellers, recentFlaggedReviews, mostSuspiciousCustomers } = data;

    return (
        <div>
            <h2>Admin Dashboard</h2>
            <div className="stat-grid">
                <StatCard label="Customers" value={totals.customers} />
                <StatCard label="Sellers" value={totals.sellers} />
                <StatCard label="Products" value={totals.products} />
                <StatCard label="Reviews" value={totals.reviews} />
                <StatCard label="Pending Flagged" value={totals.flaggedPending} />
                <StatCard label="Flag Rate" value={`${totals.flagRate}%`} />
                <StatCard label="High-Risk Customers" value={totals.highRiskCustomers} />
                <StatCard label="High-Risk Sellers" value={totals.highRiskSellers} />
            </div>

            <h3>Top Suspicious Sellers</h3>
            <table>
                <thead>
                    <tr>
                        <th>Seller</th>
                        <th>Total Reviews</th>
                        <th>Flagged</th>
                        <th>Fraud Index</th>
                    </tr>
                </thead>
                <tbody>
                    {topSuspiciousSellers.map((s) => (
                        <tr key={s.seller_id}>
                            <td>{s.seller_name}</td>
                            <td>{s.total_reviews}</td>
                            <td>{s.flagged_reviews}</td>
                            <td>{s.fraud_index ?? 0}%</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <h3>Recent Flagged Reviews</h3>
            <table>
                <thead>
                    <tr>
                        <th>Customer</th>
                        <th>Product</th>
                        <th>Risk Score</th>
                        <th>Status</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {recentFlaggedReviews.map((r) => (
                        <tr key={r.flagged_id}>
                            <td>{r.customer_name}</td>
                            <td>{r.product_name}</td>
                            <td>{r.risk_score}</td>
                            <td>{r.resolution}</td>
                            <td>
                                <Link to={`/admin/reviews/${r.review_id}`}>Investigate</Link>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <h3>Most Suspicious Customers</h3>
            <table>
                <thead>
                    <tr>
                        <th>Customer</th>
                        <th>Risk Score</th>
                        <th>Total Reviews</th>
                        <th>Flagged Reviews</th>
                    </tr>
                </thead>
                <tbody>
                    {mostSuspiciousCustomers.map((c) => (
                        <tr key={c.customer_id}>
                            <td>{c.customer_name}</td>
                            <td>{c.risk_score}</td>
                            <td>{c.total_reviews}</td>
                            <td>{c.flagged_reviews}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function StatCard({ label, value }) {
    return (
        <div className="stat-card">
            <div className="stat-value">{value}</div>
            <div className="stat-label">{label}</div>
        </div>
    );
}

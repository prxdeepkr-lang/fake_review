import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';

export default function AdminSellers() {
    const [sellers, setSellers] = useState([]);
    const [sort, setSort] = useState('');

    function load(sortKey) {
        api.listSellers(sortKey).then((res) => setSellers(res.sellers));
    }

    useEffect(() => load(sort), [sort]);

    return (
        <div>
            <h2>Sellers</h2>
            <label>Sort by: </label>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="">Default</option>
                <option value="fraud_index">Highest Fraud Index</option>
                <option value="flagged_reviews">Most Flagged Reviews</option>
                <option value="total_reviews">Most Reviews</option>
            </select>
            <table>
                <thead>
                    <tr>
                        <th>Seller</th>
                        <th>Products</th>
                        <th>Total Reviews</th>
                        <th>Flagged</th>
                        <th>Fraud Index</th>
                        <th>Avg Rating</th>
                        <th>Risk Score</th>
                    </tr>
                </thead>
                <tbody>
                    {sellers.map((s) => (
                        <tr key={s.seller_id}>
                            <td>{s.seller_name}</td>
                            <td>{s.total_products}</td>
                            <td>{s.total_reviews}</td>
                            <td>{s.flagged_reviews}</td>
                            <td>{s.fraud_index ?? 0}%</td>
                            <td>{s.avg_rating ?? '-'}</td>
                            <td>{s.risk_score}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

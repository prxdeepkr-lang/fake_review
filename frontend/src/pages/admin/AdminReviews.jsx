import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';

export default function AdminReviews() {
    const [reviews, setReviews] = useState([]);

    useEffect(() => {
        api.flaggedReviews().then((res) => setReviews(res.flaggedReviews));
    }, []);

    return (
        <div>
            <h2>Flagged Reviews</h2>
            <table>
                <thead>
                    <tr>
                        <th>Customer</th>
                        <th>Product</th>
                        <th>Seller</th>
                        <th>Risk Score</th>
                        <th>Status</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {reviews.map((r) => (
                        <tr key={r.flagged_id}>
                            <td>{r.customer_name}</td>
                            <td>{r.product_name}</td>
                            <td>{r.seller_name}</td>
                            <td>{r.risk_score}</td>
                            <td>{r.resolution}</td>
                            <td>
                                <Link to={`/admin/reviews/${r.review_id}`}>Investigate</Link>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

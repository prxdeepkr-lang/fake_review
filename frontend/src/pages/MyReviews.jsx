import React, { useEffect, useState } from 'react';
import { api } from '../services/api';

export default function MyReviews() {
    const [reviews, setReviews] = useState([]);

    useEffect(() => {
        api.myReviews().then((res) => setReviews(res.reviews));
    }, []);

    return (
        <div>
            <h2>My Reviews</h2>
            {reviews.length === 0 && <p className="muted">You haven't written any reviews yet.</p>}
            {reviews.map((r) => (
                <div key={r.review_id} className="card">
                    <p>
                        <strong>{r.product_name}</strong> - {r.rating} stars{' '}
                        {r.verified_purchase && <span className="badge">Verified Purchase</span>}
                        {!r.visible && <span className="badge badge-warn">Under Review</span>}
                    </p>
                    <p>{r.review_text}</p>
                    <p className="muted">{new Date(r.created_at).toLocaleString()}</p>
                </div>
            ))}
        </div>
    );
}

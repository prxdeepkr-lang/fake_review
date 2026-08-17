import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../AuthContext.jsx';

export default function ProductDetail() {
    const { id } = useParams();
    const { customer } = useAuth();
    const [product, setProduct] = useState(null);
    const [reviews, setReviews] = useState([]);
    const [rating, setRating] = useState(5);
    const [reviewText, setReviewText] = useState('');
    const [website, setWebsite] = useState(''); // honeypot field, never shown to real users
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    function load() {
        api.getProduct(id).then((res) => setProduct(res.product));
        api.productReviews(id).then((res) => setReviews(res.reviews));
    }

    useEffect(load, [id]);

    async function handleBuy() {
        setError('');
        setMessage('');
        try {
            await api.createOrder({ items: [{ productId: Number(id), quantity: 1 }] });
            setMessage('Order placed! An admin needs to mark it DELIVERED before your review counts as verified.');
        } catch (err) {
            setError(err.message);
        }
    }

    async function handleSubmitReview(e) {
        e.preventDefault();
        setError('');
        setMessage('');
        try {
            const res = await api.submitReview({
                productId: Number(id),
                rating: Number(rating),
                reviewText,
                website, // honeypot -- always empty for real users
            });
            setMessage(`Review submitted. Risk level: ${res.riskLevel} (score ${res.riskScore}).`);
            setReviewText('');
            load();
        } catch (err) {
            setError(err.message);
        }
    }

    if (!product) return <p>Loading...</p>;

    return (
        <div>
            <div className="card">
                <h2>{product.name}</h2>
                <p className="muted">Sold by {product.seller_name}</p>
                <p>{product.description}</p>
                <p className="price">${product.price}</p>
                <p>{product.avg_rating ? `${product.avg_rating} / 5 stars` : 'No reviews yet'}</p>
                {customer && customer.role === 'CUSTOMER' && <button onClick={handleBuy}>Buy Now</button>}
            </div>

            {error && <p className="error">{error}</p>}
            {message && <p className="success">{message}</p>}

            {customer && customer.role === 'CUSTOMER' && (
                <div className="card">
                    <h3>Write a Review</h3>
                    <form onSubmit={handleSubmitReview}>
                        <label>Rating</label>
                        <select value={rating} onChange={(e) => setRating(e.target.value)}>
                            {[5, 4, 3, 2, 1].map((r) => (
                                <option key={r} value={r}>
                                    {r} stars
                                </option>
                            ))}
                        </select>
                        <label>Review</label>
                        <textarea
                            value={reviewText}
                            onChange={(e) => setReviewText(e.target.value)}
                            required
                            rows={4}
                        />
                        {/* Honeypot: hidden from real users via CSS; bots that
                            fill every field will trip this and get flagged. */}
                        <input
                            type="text"
                            name="website"
                            tabIndex={-1}
                            autoComplete="off"
                            value={website}
                            onChange={(e) => setWebsite(e.target.value)}
                            className="honeypot"
                            aria-hidden="true"
                        />
                        <button type="submit">Submit Review</button>
                    </form>
                </div>
            )}

            <h3>Reviews</h3>
            {reviews.length === 0 && <p className="muted">No reviews yet.</p>}
            {reviews.map((r) => (
                <div key={r.review_id} className="card review-card">
                    <p>
                        <strong>{r.customer_name}</strong> - {r.rating} stars{' '}
                        {r.verified_purchase && <span className="badge">Verified Purchase</span>}
                    </p>
                    <p>{r.review_text}</p>
                    <p className="muted">{new Date(r.created_at).toLocaleDateString()}</p>
                </div>
            ))}
        </div>
    );
}

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../services/api';

const CATEGORY_ORDER = ['ACCOUNT', 'CONNECTION', 'TEXT', 'BEHAVIOR', 'SELLER', 'PURCHASE'];

export default function AdminReviewDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [error, setError] = useState('');

    function load() {
        api.reviewDetail(id).then(setData).catch((err) => setError(err.message));
    }

    useEffect(load, [id]);

    async function handleApprove() {
        await api.approveReview(id);
        load();
    }

    async function handleRemove() {
        await api.removeReview(id);
        load();
    }

    if (error) return <p className="error">{error}</p>;
    if (!data) return <p>Loading...</p>;

    const { review, riskLevel, signalsByCategory, connectionEvidence } = data;

    return (
        <div>
            <button onClick={() => navigate(-1)}>&larr; Back</button>
            <div className="card">
                <h2>Review #{review.review_id}</h2>
                <p>
                    <strong>Customer:</strong> {review.customer_name} | <strong>Product:</strong> {review.product_name} |{' '}
                    <strong>Seller:</strong> {review.seller_name}
                </p>
                <p>
                    <strong>Rating:</strong> {review.rating} stars |{' '}
                    <strong>Verified Purchase:</strong> {review.verified_purchase ? 'Yes' : 'No'} |{' '}
                    <strong>Created:</strong> {new Date(review.created_at).toLocaleString()}
                </p>
                <blockquote>{review.review_text}</blockquote>
                <p className={`risk-badge risk-${riskLevel.toLowerCase()}`}>
                    Risk Score: {review.risk_score} / 100 ({riskLevel} RISK)
                </p>
                {review.flagged_id && (
                    <>
                        <p>
                            <strong>Resolution:</strong> {review.resolution}
                        </p>
                        {review.resolution === 'PENDING' && (
                            <div className="actions">
                                <button onClick={handleApprove}>Approve</button>
                                <button className="danger" onClick={handleRemove}>
                                    Remove
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>

            <div className="card">
                <h3>Signal Breakdown</h3>
                <p className="muted">
                    Every contributing signal, grouped by category. This score is explainable, not a binary
                    fake/genuine verdict.
                </p>
                {CATEGORY_ORDER.filter((cat) => signalsByCategory[cat]?.length).map((cat) => (
                    <div key={cat} className="signal-group">
                        <h4>{cat} SIGNALS</h4>
                        <ul>
                            {signalsByCategory[cat].map((s, i) => (
                                <li key={i} className={s.score >= 0 ? 'signal-positive' : 'signal-negative'}>
                                    {s.score >= 0 ? '+' : ''}
                                    {s.score} {s.signal_type} - {s.details}
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>

            {connectionEvidence && (
                <div className="card">
                    <h3>Connection Evidence</h3>
                    <p className="muted">Supporting evidence only, never proof of fraud on its own.</p>
                    <ul>
                        <li>ISP: {connectionEvidence.isp}</li>
                        <li>Country: {connectionEvidence.country}</li>
                        <li>Proxy: {connectionEvidence.is_proxy ? 'Yes' : 'No'}</li>
                        <li>VPN: {connectionEvidence.is_vpn ? 'Yes' : 'No'}</li>
                        <li>Tor: {connectionEvidence.is_tor ? 'Yes' : 'No'}</li>
                        <li>Header Anomaly Score: {connectionEvidence.header_anomaly_score}</li>
                        <li>Honeypot Triggered: {connectionEvidence.honeypot_triggered ? 'Yes' : 'No'}</li>
                        <li>User Agent: {connectionEvidence.user_agent}</li>
                    </ul>
                </div>
            )}
        </div>
    );
}

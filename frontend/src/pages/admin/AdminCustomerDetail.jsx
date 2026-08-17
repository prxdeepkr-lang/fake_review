import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../../services/api';

export default function AdminCustomerDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        api.customerDetail(id)
            .then(setData)
            .catch((err) => setError(err.message));
    }, [id]);

    if (error) return <p className="error">{error}</p>;
    if (!data) return <p>Loading...</p>;

    const { customer, reviews, signalSummary, riskHistory } = data;
    const riskLevel = customer.risk_score >= 60 ? 'HIGH' : customer.risk_score >= 30 ? 'MEDIUM' : 'LOW';

    return (
        <div>
            <button onClick={() => navigate(-1)}>&larr; Back</button>

            <div className="card">
                <h2>{customer.customer_name}</h2>
                <p className="muted">{customer.email}</p>
                <p>
                    <strong>Account created:</strong> {new Date(customer.account_created_at).toLocaleString()} |{' '}
                    <strong>Status:</strong> {customer.account_status}
                </p>
                <p className={`risk-badge risk-${riskLevel.toLowerCase()}`}>
                    Risk Score: {customer.risk_score} / 100 ({riskLevel} RISK)
                </p>
                <p className="muted">
                    This score is an average of this customer's last several review risk scores, not a verdict --
                    see the signal breakdown below for exactly why.
                </p>
                <div className="stat-grid">
                    <MiniStat label="Total Reviews" value={customer.total_reviews} />
                    <MiniStat label="Verified Reviews" value={customer.verified_reviews} />
                    <MiniStat label="Flagged Reviews" value={customer.flagged_reviews} />
                    <MiniStat label="Avg Rating Given" value={customer.avg_rating_given ?? '-'} />
                </div>
            </div>

            <div className="card">
                <h3>Why This Score: Signal Summary Across All Reviews</h3>
                {signalSummary.length === 0 && <p className="muted">No fraud signals have ever fired for this customer.</p>}
                {signalSummary.length > 0 && (
                    <table>
                        <thead>
                            <tr>
                                <th>Category</th>
                                <th>Signal</th>
                                <th>Times Fired</th>
                                <th>Total Score Contributed</th>
                            </tr>
                        </thead>
                        <tbody>
                            {signalSummary.map((s, i) => (
                                <tr key={i}>
                                    <td>{s.category}</td>
                                    <td>{s.signal_type}</td>
                                    <td>{s.occurrences}</td>
                                    <td className={s.total_score >= 0 ? 'signal-positive' : 'signal-negative'}>
                                        {s.total_score >= 0 ? '+' : ''}
                                        {s.total_score}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="card">
                <h3>Review History</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Product</th>
                            <th>Rating</th>
                            <th>Verified</th>
                            <th>Risk Score</th>
                            <th>Status</th>
                            <th>Date</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {reviews.map((r) => (
                            <tr key={r.review_id}>
                                <td>{r.product_name}</td>
                                <td>{r.rating}</td>
                                <td>{r.verified_purchase ? 'Yes' : 'No'}</td>
                                <td>{r.risk_score}</td>
                                <td>{r.flagged_id ? r.resolution : r.visible ? 'Published' : 'Hidden'}</td>
                                <td>{new Date(r.created_at).toLocaleDateString()}</td>
                                <td>
                                    <Link to={`/admin/reviews/${r.review_id}`}>Investigate</Link>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {riskHistory.length > 0 && (
                <div className="card">
                    <h3>Risk Score Trend</h3>
                    <p className="muted">Snapshots recorded each time one of this customer's reviews was flagged.</p>
                    <ul>
                        {riskHistory.map((h, i) => (
                            <li key={i}>
                                {new Date(h.calculated_at).toLocaleString()}: {h.risk_score}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

function MiniStat({ label, value }) {
    return (
        <div className="stat-card">
            <div className="stat-value">{value}</div>
            <div className="stat-label">{label}</div>
        </div>
    );
}

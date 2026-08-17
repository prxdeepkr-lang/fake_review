import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';

export default function Products() {
    const [products, setProducts] = useState([]);
    const [error, setError] = useState('');

    useEffect(() => {
        api.listProducts()
            .then((res) => setProducts(res.products))
            .catch((err) => setError(err.message));
    }, []);

    return (
        <div>
            <h2>Products</h2>
            {error && <p className="error">{error}</p>}
            <div className="grid">
                {products.map((p) => (
                    <Link key={p.product_id} to={`/products/${p.product_id}`} className="card product-card">
                        <h3>{p.name}</h3>
                        <p className="muted">Sold by {p.seller_name}</p>
                        <p>${p.price}</p>
                        <p>
                            {p.avg_rating ? `${p.avg_rating} / 5 stars` : 'No reviews yet'} ({p.review_count} reviews)
                        </p>
                    </Link>
                ))}
            </div>
        </div>
    );
}

import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';

export default function AdminProducts() {
    const [products, setProducts] = useState([]);
    const [sellers, setSellers] = useState([]);
    const [form, setForm] = useState({ sellerId: '', name: '', description: '', price: '' });
    const [newSellerName, setNewSellerName] = useState('');
    const [error, setError] = useState('');

    function load() {
        api.listProducts().then((res) => setProducts(res.products));
        api.listSellers().then((res) => setSellers(res.sellers));
    }

    useEffect(load, []);

    async function handleCreateProduct(e) {
        e.preventDefault();
        setError('');
        try {
            await api.createProduct({ ...form, sellerId: Number(form.sellerId), price: Number(form.price) });
            setForm({ sellerId: '', name: '', description: '', price: '' });
            load();
        } catch (err) {
            setError(err.message);
        }
    }

    async function handleCreateSeller(e) {
        e.preventDefault();
        setError('');
        try {
            await api.createSeller({ name: newSellerName });
            setNewSellerName('');
            load();
        } catch (err) {
            setError(err.message);
        }
    }

    async function handleDeactivate(id) {
        await api.deactivateProduct(id);
        load();
    }

    return (
        <div>
            <h2>Manage Products</h2>
            {error && <p className="error">{error}</p>}

            <div className="card">
                <h3>Add Seller</h3>
                <form onSubmit={handleCreateSeller} className="inline-form">
                    <input
                        placeholder="Seller name"
                        value={newSellerName}
                        onChange={(e) => setNewSellerName(e.target.value)}
                        required
                    />
                    <button type="submit">Add Seller</button>
                </form>
            </div>

            <div className="card">
                <h3>Add Product</h3>
                <form onSubmit={handleCreateProduct}>
                    <label>Seller</label>
                    <select
                        value={form.sellerId}
                        onChange={(e) => setForm({ ...form, sellerId: e.target.value })}
                        required
                    >
                        <option value="" disabled>
                            Select a seller
                        </option>
                        {sellers.map((s) => (
                            <option key={s.seller_id} value={s.seller_id}>
                                {s.seller_name}
                            </option>
                        ))}
                    </select>
                    <label>Name</label>
                    <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                    <label>Description</label>
                    <textarea
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                    />
                    <label>Price</label>
                    <input
                        type="number"
                        step="0.01"
                        value={form.price}
                        onChange={(e) => setForm({ ...form, price: e.target.value })}
                        required
                    />
                    <button type="submit">Add Product</button>
                </form>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Seller</th>
                        <th>Price</th>
                        <th>Status</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {products.map((p) => (
                        <tr key={p.product_id}>
                            <td>{p.name}</td>
                            <td>{p.seller_name}</td>
                            <td>${p.price}</td>
                            <td>{p.status}</td>
                            <td>
                                {p.status === 'ACTIVE' && (
                                    <button onClick={() => handleDeactivate(p.product_id)}>Deactivate</button>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

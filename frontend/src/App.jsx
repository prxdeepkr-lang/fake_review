import React from 'react';
import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext.jsx';

import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Products from './pages/Products.jsx';
import ProductDetail from './pages/ProductDetail.jsx';
import Orders from './pages/Orders.jsx';
import MyReviews from './pages/MyReviews.jsx';

import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import AdminOrders from './pages/admin/AdminOrders.jsx';
import AdminProducts from './pages/admin/AdminProducts.jsx';
import AdminReviews from './pages/admin/AdminReviews.jsx';
import AdminReviewDetail from './pages/admin/AdminReviewDetail.jsx';
import AdminSellers from './pages/admin/AdminSellers.jsx';
import AdminCustomers from './pages/admin/AdminCustomers.jsx';
import AdminCustomerDetail from './pages/admin/AdminCustomerDetail.jsx';
import AdminPhrases from './pages/admin/AdminPhrases.jsx';

function RequireRole({ role, children }) {
    const { customer, loading } = useAuth();
    if (loading) return <p>Loading...</p>;
    if (!customer) return <Navigate to={role === 'ADMIN' ? '/admin/login' : '/login'} replace />;
    if (role && customer.role !== role) return <Navigate to="/" replace />;
    return children;
}

function Nav() {
    const { customer, logout } = useAuth();
    const navigate = useNavigate();

    async function handleLogout() {
        await logout();
        navigate('/login');
    }

    return (
        <nav>
            <div className="nav-brand">Review Trust &amp; Fraud Detection</div>
            <div className="nav-links">
                {customer?.role === 'CUSTOMER' && (
                    <>
                        <Link to="/products">Products</Link>
                        <Link to="/orders">My Orders</Link>
                        <Link to="/my-reviews">My Reviews</Link>
                    </>
                )}
                {customer?.role === 'ADMIN' && (
                    <>
                        <Link to="/admin/dashboard">Dashboard</Link>
                        <Link to="/admin/orders">Orders</Link>
                        <Link to="/admin/products">Products</Link>
                        <Link to="/admin/reviews">Flagged Reviews</Link>
                        <Link to="/admin/sellers">Sellers</Link>
                        <Link to="/admin/customers">Customers</Link>
                        <Link to="/admin/phrases">Phrases</Link>
                    </>
                )}
                {customer ? (
                    <button className="link-button" onClick={handleLogout}>
                        Log Out ({customer.name})
                    </button>
                ) : (
                    <>
                        <Link to="/login">Log In</Link>
                        <Link to="/admin/login">Admin Log In</Link>
                    </>
                )}
            </div>
        </nav>
    );
}

export default function App() {
    return (
        <AuthProvider>
            <Nav />
            <main>
                <Routes>
                    <Route path="/" element={<Navigate to="/products" replace />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/admin/login" element={<Login />} />
                    <Route path="/products" element={<Products />} />
                    <Route path="/products/:id" element={<ProductDetail />} />
                    <Route
                        path="/orders"
                        element={
                            <RequireRole role="CUSTOMER">
                                <Orders />
                            </RequireRole>
                        }
                    />
                    <Route
                        path="/my-reviews"
                        element={
                            <RequireRole role="CUSTOMER">
                                <MyReviews />
                            </RequireRole>
                        }
                    />

                    <Route
                        path="/admin/dashboard"
                        element={
                            <RequireRole role="ADMIN">
                                <AdminDashboard />
                            </RequireRole>
                        }
                    />
                    <Route
                        path="/admin/orders"
                        element={
                            <RequireRole role="ADMIN">
                                <AdminOrders />
                            </RequireRole>
                        }
                    />
                    <Route
                        path="/admin/products"
                        element={
                            <RequireRole role="ADMIN">
                                <AdminProducts />
                            </RequireRole>
                        }
                    />
                    <Route
                        path="/admin/reviews"
                        element={
                            <RequireRole role="ADMIN">
                                <AdminReviews />
                            </RequireRole>
                        }
                    />
                    <Route
                        path="/admin/reviews/:id"
                        element={
                            <RequireRole role="ADMIN">
                                <AdminReviewDetail />
                            </RequireRole>
                        }
                    />
                    <Route
                        path="/admin/sellers"
                        element={
                            <RequireRole role="ADMIN">
                                <AdminSellers />
                            </RequireRole>
                        }
                    />
                    <Route
                        path="/admin/customers"
                        element={
                            <RequireRole role="ADMIN">
                                <AdminCustomers />
                            </RequireRole>
                        }
                    />
                    <Route
                        path="/admin/customers/:id"
                        element={
                            <RequireRole role="ADMIN">
                                <AdminCustomerDetail />
                            </RequireRole>
                        }
                    />
                    <Route
                        path="/admin/phrases"
                        element={
                            <RequireRole role="ADMIN">
                                <AdminPhrases />
                            </RequireRole>
                        }
                    />
                </Routes>
            </main>
        </AuthProvider>
    );
}

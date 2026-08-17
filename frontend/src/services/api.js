const BASE_URL = '/api';

async function request(path, options = {}) {
    const res = await fetch(`${BASE_URL}${path}`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options,
        body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.error || data.errors?.[0]?.msg || `Request failed (${res.status})`);
    }
    return data;
}

export const api = {
    // Auth
    register: (body) => request('/auth/register', { method: 'POST', body }),
    login: (body) => request('/auth/login', { method: 'POST', body }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    me: () => request('/auth/me'),

    // Products
    listProducts: () => request('/products'),
    getProduct: (id) => request(`/products/${id}`),
    createProduct: (body) => request('/products', { method: 'POST', body }),
    updateProduct: (id, body) => request(`/products/${id}`, { method: 'PUT', body }),
    deactivateProduct: (id) => request(`/products/${id}`, { method: 'DELETE' }),

    // Orders
    listOrders: () => request('/orders'),
    createOrder: (body) => request('/orders', { method: 'POST', body }),
    setOrderStatus: (id, status) => request(`/orders/${id}/status`, { method: 'PUT', body: { status } }),

    // Reviews
    submitReview: (body) => request('/reviews', { method: 'POST', body }),
    myReviews: () => request('/reviews/my'),
    productReviews: (productId) => request(`/products/${productId}/reviews`),

    // Admin
    dashboard: () => request('/admin/dashboard'),
    listAllOrders: () => request('/admin/orders'),
    setAdminOrderStatus: (id, status) => request(`/admin/orders/${id}/status`, { method: 'PUT', body: { status } }),
    listSellers: (sort) => request(`/admin/sellers${sort ? `?sort=${sort}` : ''}`),
    createSeller: (body) => request('/admin/sellers', { method: 'POST', body }),
    listCustomers: () => request('/admin/customers'),
    customerDetail: (id) => request(`/admin/customers/${id}`),
    flaggedReviews: () => request('/admin/reviews/flagged'),
    reviewDetail: (id) => request(`/admin/reviews/${id}`),
    approveReview: (id) => request(`/admin/reviews/${id}/approve`, { method: 'POST' }),
    removeReview: (id) => request(`/admin/reviews/${id}/remove`, { method: 'POST' }),
    listPhrases: () => request('/admin/phrases'),
    createPhrase: (body) => request('/admin/phrases', { method: 'POST', body }),
    deletePhrase: (id) => request(`/admin/phrases/${id}`, { method: 'DELETE' }),
};

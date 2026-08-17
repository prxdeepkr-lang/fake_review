import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';

export default function AdminPhrases() {
    const [phrases, setPhrases] = useState([]);
    const [phrase, setPhrase] = useState('');
    const [weight, setWeight] = useState(8);
    const [error, setError] = useState('');

    function load() {
        api.listPhrases().then((res) => setPhrases(res.phrases));
    }

    useEffect(load, []);

    async function handleAdd(e) {
        e.preventDefault();
        setError('');
        try {
            await api.createPhrase({ phrase, weight: Number(weight) });
            setPhrase('');
            load();
        } catch (err) {
            setError(err.message);
        }
    }

    async function handleDelete(id) {
        await api.deletePhrase(id);
        load();
    }

    return (
        <div>
            <h2>Suspicious Phrases</h2>
            <p className="muted">Managed here instead of hardcoded in the fraud engine.</p>
            {error && <p className="error">{error}</p>}
            <form onSubmit={handleAdd} className="inline-form">
                <input placeholder="Phrase" value={phrase} onChange={(e) => setPhrase(e.target.value)} required />
                <input
                    type="number"
                    min={1}
                    max={50}
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    required
                />
                <button type="submit">Add Phrase</button>
            </form>
            <table>
                <thead>
                    <tr>
                        <th>Phrase</th>
                        <th>Weight</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {phrases.map((p) => (
                        <tr key={p.phrase_id}>
                            <td>{p.phrase}</td>
                            <td>{p.weight}</td>
                            <td>
                                <button onClick={() => handleDelete(p.phrase_id)}>Delete</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

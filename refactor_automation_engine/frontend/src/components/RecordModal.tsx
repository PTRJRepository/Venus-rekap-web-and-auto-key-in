import React, { useState } from 'react';

interface RecordModalProps {
    onConfirm: (url: string) => void;
    onCancel: () => void;
}

// Normalize URL - ensure it has a protocol, default to http for internal IPs
const normalizeUrl = (inputUrl: string): string => {
    const trimmed = inputUrl.trim();

    // If empty, return empty
    if (!trimmed) return '';

    // If already has protocol, return as is
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return trimmed;
    }

    // Check if it looks like an internal IP or hostname (no dots, or ends with :port)
    // Default to http for internal systems
    return `http://${trimmed}`;
};

const RecordModal: React.FC<RecordModalProps> = ({ onConfirm, onCancel }) => {
    const [url, setUrl] = useState('http://');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const normalizedUrl = normalizeUrl(url);
        if (normalizedUrl) onConfirm(normalizedUrl);
    };

    return (
        <div className="modal-overlay" onClick={onCancel}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal__header">
                    <span className="modal__icon">🔴</span>
                    <h3 className="modal__title">Start Recording</h3>
                </div>
                <p className="modal__desc">
                    Enter the URL to open. A browser will launch and all your interactions
                    (clicks, typing) will be captured and converted into flow nodes automatically.
                </p>
                <form onSubmit={handleSubmit}>
                    <label className="modal__label">Target URL</label>
                    <input
                        className="modal__input"
                        type="url"
                        value={url}
                        onChange={e => setUrl(e.target.value)}
                        placeholder="http://plantwarep3:8001"
                        autoFocus
                    />
                    <small style={{ color: '#888', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                        💡 Use <strong>http://</strong> for internal systems, <strong>https://</strong> for external sites
                    </small>
                    <div className="modal__actions">
                        <button type="button" className="modal__btn modal__btn--cancel" onClick={onCancel}>
                            Cancel
                        </button>
                        <button type="submit" className="modal__btn modal__btn--confirm">
                            🎬 Start Recording
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default RecordModal;

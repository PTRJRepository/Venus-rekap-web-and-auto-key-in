import React, { useState } from 'react';

export interface TemplateInfo {
    name: string;
    filename: string;
    description?: string;
}

interface ImportModalProps {
    onConfirm: (flowData: any) => void;
    onCancel: () => void;
    templates: TemplateInfo[];
}

const ImportModal: React.FC<ImportModalProps> = ({ onConfirm, onCancel, templates }) => {
    const [selectedTab, setSelectedTab] = useState<'templates' | 'upload'>('templates');
    const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);

    const handleTemplateSelect = (filename: string) => {
        setSelectedTemplate(filename);
    };

    const handleLoadTemplate = async () => {
        if (!selectedTemplate) return;
        try {
            const response = await fetch(`/api/templates/${selectedTemplate}`);
            if (!response.ok) {
                throw new Error('Failed to load template');
            }
            const flowData = await response.json();
            // Ensure filename is included so the editor knows what to overwrite
            onConfirm({ ...flowData, filename: selectedTemplate });
        } catch (error: any) {
            setUploadError(error.message);
        }
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!file.name.endsWith('.json') && !file.name.endsWith('.flow.json')) {
            setUploadError('Please upload a valid .json or .flow.json file');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target?.result as string;
                const flowData = JSON.parse(content);
                
                // Basic validation
                if (!flowData.nodes || !Array.isArray(flowData.nodes)) {
                    throw new Error('Invalid flow format: missing nodes array');
                }
                
                setUploadError(null);
                onConfirm(flowData);
            } catch (error: any) {
                setUploadError(`Invalid JSON: ${error.message}`);
            }
        };
        reader.onerror = () => {
            setUploadError('Failed to read file');
        };
        reader.readAsText(file);
    };

    return (
        <div className="modal-overlay" onClick={onCancel}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                <div className="modal__header">
                    <h2>📥 Import Flow Template</h2>
                    <button className="modal__close" onClick={onCancel}>×</button>
                </div>

                <div className="modal__tabs">
                    <button
                        className={`modal__tab ${selectedTab === 'templates' ? 'active' : ''}`}
                        onClick={() => { setSelectedTab('templates'); setUploadError(null); }}
                    >
                        📋 From Templates
                    </button>
                    <button
                        className={`modal__tab ${selectedTab === 'upload' ? 'active' : ''}`}
                        onClick={() => { setSelectedTab('upload'); setUploadError(null); }}
                    >
                        📁 Upload File
                    </button>
                </div>

                <div className="modal__content">
                    {selectedTab === 'templates' && (
                        <div className="template-list">
                            {templates.length === 0 ? (
                                <p className="template-list__empty">No templates available</p>
                            ) : (
                                <ul className="template-list__items">
                                    {templates.map((template) => (
                                        <li
                                            key={template.filename}
                                            className={`template-list__item ${selectedTemplate === template.filename ? 'selected' : ''}`}
                                            onClick={() => handleTemplateSelect(template.filename)}
                                        >
                                            <div className="template-list__name">{template.name}</div>
                                            {template.description && (
                                                <div className="template-list__description">{template.description}</div>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <div className="modal__footer">
                                <button className="btn btn--secondary" onClick={onCancel}>Cancel</button>
                                <button
                                    className="btn btn--primary"
                                    onClick={handleLoadTemplate}
                                    disabled={!selectedTemplate}
                                >
                                    Load Template
                                </button>
                            </div>
                        </div>
                    )}

                    {selectedTab === 'upload' && (
                        <div className="upload-section">
                            <p className="upload-section__hint">
                                Upload a flow template file (.json or .flow.json)
                            </p>
                            <div className="upload-section__dropzone">
                                <input
                                    type="file"
                                    accept=".json,.flow.json"
                                    onChange={handleFileUpload}
                                    id="file-upload"
                                />
                                <label htmlFor="file-upload" className="upload-section__label">
                                    <span className="upload-section__icon">📁</span>
                                    <span>Choose File</span>
                                </label>
                            </div>
                            {uploadError && (
                                <div className="upload-section__error">{uploadError}</div>
                            )}
                            <div className="modal__footer">
                                <button className="btn btn--secondary" onClick={onCancel}>Cancel</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ImportModal;

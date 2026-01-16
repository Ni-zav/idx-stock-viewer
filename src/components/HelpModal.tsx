import React from 'react'

interface HelpModalProps {
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
  const hotkeys = [
    { category: 'Navigation', items: [
      { key: '/', description: 'Open ticker search' },
      { key: 'A', description: 'Add new ticker' },
      { key: 'Tab', description: 'Toggle Dashboard/Chart view' },
      { key: 'Esc', description: 'Close modals/dropdowns' },
    ]},
    { category: 'Chart Controls', items: [
      { key: 'G', description: 'Toggle show/hide gaps' },
      { key: 'L', description: 'Toggle live streaming' },
      { key: 'U', description: 'Update all data' },
      { key: 'T', description: 'Open timeframe selector' },
    ]},
    { category: 'Dashboard (when visible)', items: [
      { key: '1-9, 0', description: 'Select ticker by rank (0=10th)' },
      { key: 'Shift+P', description: 'Sort by Price' },
      { key: 'Shift+D', description: 'Sort by Daily change' },
      { key: 'Shift+W', description: 'Sort by Weekly change' },
      { key: 'Shift+M', description: 'Sort by Monthly change' },
      { key: 'Shift+Y', description: 'Sort by Yearly change' },
      { key: 'Shift+X', description: 'Sort by Max change' },
      { key: 'Shift+T', description: 'Sort by Ticker name' },
      { key: 'Shift+V', description: 'Sort by Volume' },
    ]},
    { category: 'General', items: [
      { key: '?', description: 'Show this help' },
    ]},
  ]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-window help-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span>⌨️ KEYBOARD SHORTCUTS</span>
          <button className="modal-close-btn" onClick={onClose}>×</button>
        </div>
        <div className="modal-body help-body">
          {hotkeys.map(category => (
            <div key={category.category} className="help-category">
              <h3 className="help-category-title">{category.category}</h3>
              <div className="help-items">
                {category.items.map(item => (
                  <div key={item.key} className="help-item">
                    <kbd className="help-key">{item.key}</kbd>
                    <span className="help-desc">{item.description}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button className="modal-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

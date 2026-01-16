import React, { useState, useEffect } from 'react'

interface SettingsModalProps {
  onClose: () => void
  timezone: string
  onTimezoneChange: (tz: string) => void
}

const TIMEZONES = [
  { value: 'Asia/Jakarta', label: 'Jakarta (WIB, UTC+7)' },
  { value: 'Asia/Makassar', label: 'Makassar (WITA, UTC+8)' },
  { value: 'Asia/Jayapura', label: 'Jayapura (WIT, UTC+9)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT, UTC+8)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST, UTC+9)' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong (HKT, UTC+8)' },
  { value: 'America/New_York', label: 'New York (EST/EDT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
]

export const SettingsModal: React.FC<SettingsModalProps> = ({ 
  onClose, 
  timezone, 
  onTimezoneChange 
}) => {
  const [selectedTimezone, setSelectedTimezone] = useState(timezone)

  const handleSave = () => {
    onTimezoneChange(selectedTimezone)
    localStorage.setItem('userTimezone', selectedTimezone)
    onClose()
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-window settings-modal">
        <div className="modal-header">
          <span>⚙ SETTINGS</span>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="settings-group">
            <label className="settings-label">Display Timezone</label>
            <p className="settings-desc">
              Chart timestamps will be converted to this timezone.
            </p>
            <select 
              className="settings-select"
              value={selectedTimezone}
              onChange={(e) => setSelectedTimezone(e.target.value)}
            >
              {TIMEZONES.map(tz => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button className="modal-btn" onClick={onClose}>Cancel</button>
          <button className="modal-btn primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  )
}

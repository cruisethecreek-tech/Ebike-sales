'use client'

import { useActionState, useState } from 'react'
import { registerBike } from './actions'

const initialState = {
  error: '',
}

export default function BikeForm() {
  const [state, formAction, isPending] = useActionState(registerBike, initialState)
  const [isOpen, setIsOpen] = useState(false)

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)} 
        className="btn-primary mb-6"
      >
        Register New Bike
      </button>
    )
  }

  return (
    <div className="card mb-8 p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Register New Bike</h2>
        <button 
          onClick={() => setIsOpen(false)}
          className="text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
      </div>
      
      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="brand" className="label">Brand</label>
          <select id="brand" name="brand" required className="select w-full">
            <option value="">Select brand...</option>
            <option value="Heybike">Heybike</option>
            <option value="Velotric">Velotric</option>
            <option value="Jasion">Jasion</option>
            <option value="Mooncool">Mooncool</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label htmlFor="model" className="label">Model</label>
          <input 
            type="text" 
            id="model" 
            name="model" 
            required 
            className="input w-full"
            placeholder="e.g. Cityrun"
          />
        </div>

        <div>
          <label htmlFor="serial_number" className="label">Serial Number (Optional)</label>
          <input 
            type="text" 
            id="serial_number" 
            name="serial_number" 
            className="input w-full"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="purchase_date" className="label">Purchase Date (Optional)</label>
            <input 
              type="date" 
              id="purchase_date" 
              name="purchase_date" 
              className="input w-full"
            />
          </div>
          <div>
            <label htmlFor="warranty_expires_at" className="label">Warranty Expires (Optional)</label>
            <input 
              type="date" 
              id="warranty_expires_at" 
              name="warranty_expires_at" 
              className="input w-full"
            />
          </div>
        </div>

        {state?.error && (
          <div className="text-red-500 text-sm mt-2">{state.error as string}</div>
        )}

        <div className="flex justify-end pt-4">
          <button 
            type="submit" 
            disabled={isPending}
            className="btn-primary"
          >
            {isPending ? 'Registering...' : 'Register Bike'}
          </button>
        </div>
      </form>
    </div>
  )
}

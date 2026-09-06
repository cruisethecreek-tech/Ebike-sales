'use client'

import { useActionState, useEffect, useRef } from 'react'
import { createTicket } from './actions'

type Bike = {
  id: string
  brand: string
  model: string
}

export default function TicketForm({ bikes }: { bikes: Bike[] }) {
  const [state, action, isPending] = useActionState(createTicket, null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset()
    }
  }, [state])

  return (
    <div className="card mb-8 p-6 bg-white rounded-lg shadow-sm border border-gray-200">
      <h2 className="text-xl font-bold mb-4">Open a Ticket</h2>
      {state?.success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4">
          Ticket created successfully!
        </div>
      )}
      {state?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {state.error}
        </div>
      )}
      <form action={action} ref={formRef} className="space-y-4">
        <div>
          <label htmlFor="ticket_type" className="label">Ticket Type</label>
          <select name="ticket_type" id="ticket_type" className="select" required>
            <option value="tune-up">Tune-up</option>
            <option value="warranty">Warranty</option>
            <option value="general question">General Question</option>
            <option value="upgrade request">Upgrade Request</option>
          </select>
        </div>

        <div>
          <label htmlFor="bike_id" className="label">Bike (Optional)</label>
          <select name="bike_id" id="bike_id" className="select">
            <option value="">None / Not applicable</option>
            {bikes.map(bike => (
              <option key={bike.id} value={bike.id}>
                {bike.brand} {bike.model}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="description" className="label">Description</label>
          <textarea
            name="description"
            id="description"
            className="textarea h-32"
            required
            placeholder="Please describe your issue or request..."
          ></textarea>
        </div>

        <button type="submit" className="btn-primary w-full" disabled={isPending}>
          {isPending ? 'Submitting...' : 'Submit Ticket'}
        </button>
      </form>
    </div>
  )
}

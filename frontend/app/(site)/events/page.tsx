import { Suspense } from 'react'
import EventsClient from './EventsClient'
export const metadata = { title: 'Events' }
export default function Page() { return <Suspense fallback={<div className="cx-w cx-sec"><div className="skel" style={{ height: 300 }} /></div>}><EventsClient /></Suspense> }

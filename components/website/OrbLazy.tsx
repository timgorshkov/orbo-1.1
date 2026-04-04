'use client'

import dynamic from 'next/dynamic'

const Orb = dynamic(() => import('@/components/website/Orb'), { ssr: false })

export default Orb

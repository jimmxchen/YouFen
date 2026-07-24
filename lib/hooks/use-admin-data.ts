'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Member, Contribution, Proposal, DashboardStats, Task, Activity } from '@/types/admin'
import type { AdminRecord } from '@/lib/api/admin'

// ------------------------------------------------------------------ helpers

const BASE = '/api/admin'

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
}

function useAdminData<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!url) return
    setLoading(true)
    setError(null)
    try {
      const result = await fetchJson<T>(url)
      setData(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [url])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { data, loading, error, refetch: fetchData }
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return fetchJson<T>(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return fetchJson<T>(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ------------------------------------------------------------------- hooks

export function useAdminDashboard(communityId: string) {
  const { data, loading, error, refetch } = useAdminData<{ stats: DashboardStats }>(
    `${BASE}/dashboard?communityId=${communityId}`,
  )
  return {
    stats: data?.stats ?? null,
    loading,
    error,
    refetch,
  }
}

export function useAdminMembers(communityId: string) {
  const { data, loading, error, refetch } = useAdminData<{ members: Member[] }>(
    `${BASE}/members?communityId=${communityId}`,
  )
  return {
    members: data?.members ?? [],
    loading,
    error,
    refetch,
  }
}

export function useAdminMember(id: string) {
  const { data, loading, error, refetch } = useAdminData<{ member: Member; contributions: Contribution[] }>(
    id ? `${BASE}/members/${id}` : null,
  )
  return {
    member: data?.member ?? null,
    contributions: data?.contributions ?? [],
    loading,
    error,
    refetch,
  }
}

export function useAdminContributions(communityId: string, status?: string) {
  const params = new URLSearchParams({ communityId })
  if (status) params.set('status', status)
  const { data, loading, error, refetch } = useAdminData<{ contributions: Contribution[] }>(
    `${BASE}/contributions?${params}`,
  )
  return {
    contributions: data?.contributions ?? [],
    loading,
    error,
    refetch,
  }
}

export function useAdminProposals(communityId: string) {
  const { data, loading, error, refetch } = useAdminData<{ proposals: Proposal[] }>(
    `${BASE}/proposals?communityId=${communityId}`,
  )
  return {
    proposals: data?.proposals ?? [],
    loading,
    error,
    refetch,
  }
}

export function useAdminProposal(id: string) {
  const { data, loading, error, refetch } = useAdminData<{ proposal: Proposal }>(
    id ? `${BASE}/proposals/${id}` : null,
  )
  return {
    proposal: data?.proposal ?? null,
    loading,
    error,
    refetch,
  }
}

export function useAdminRecords(communityId: string) {
  const { data, loading, error, refetch } = useAdminData<{ records: AdminRecord[] }>(
    `${BASE}/records?communityId=${communityId}`,
  )
  return {
    records: data?.records ?? [],
    loading,
    error,
    refetch,
  }
}

// ---- Tasks ----

export function useAdminTasks(communityId: string, status?: string) {
  const params = new URLSearchParams({ communityId })
  if (status) params.set('status', status)
  const { data, loading, error, refetch } = useAdminData<{ tasks: Task[] }>(
    `${BASE}/tasks?${params}`,
  )
  return {
    tasks: data?.tasks ?? [],
    loading,
    error,
    refetch,
  }
}

// ---- Activities ----

export function useAdminActivities(communityId: string, status?: string) {
  const params = new URLSearchParams({ communityId })
  if (status) params.set('status', status)
  const { data, loading, error, refetch } = useAdminData<{ activities: Activity[] }>(
    `${BASE}/activities?${params}`,
  )
  return {
    activities: data?.activities ?? [],
    loading,
    error,
    refetch,
  }
}

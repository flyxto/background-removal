// Utility function to validate dealer NIC numbers using API endpoint
// Client-side validation functions that call the API

// Interface for dealer data
export interface Dealer {
  AREA: string
  "BP CODE": number
  "BP NAME": string
  "OUTLET CODE": string
  "OUTLET NAME": string
  CLASSIFICATION: string
  "DEALER NAME": string
  NICNUMBER: string
  CONTACTNO: number
  "EVENT DATE": string
  HOTEL: string
}

// Interface for API response
interface ValidationResponse {
  valid: boolean
  dealer?: Dealer
  message?: string
  error?: string
}

interface BulkValidationResponse {
  results: Array<{
    nic: string
    valid: boolean
    dealer?: Dealer
  }>
  total: number
  found: number
}

// Cache the dealers data to avoid fetching it multiple times (optional)
let dealersCache: Map<string, Dealer> = new Map()
let lastCacheUpdate = 0
const CACHE_DURATION = 1000 * 60 * 5 // 5 minutes

/**
 * Validate if a NIC number exists in the dealers list using API endpoint
 */
export async function validateDealerNIC(nic: string): Promise<{ valid: boolean; dealer?: Dealer }> {
  try {
    if (!nic || !nic.trim()) {
      throw new Error("NIC number is required")
    }

    const normalizedNIC = nic.trim().toUpperCase()

    // Check cache first (optional optimization)
    const currentTime = Date.now()
    if (dealersCache.has(normalizedNIC) && (currentTime - lastCacheUpdate < CACHE_DURATION)) {
      const dealer = dealersCache.get(normalizedNIC)
      return { valid: true, dealer }
    }

    // Make API call
    const response = await fetch(`/api/validate-dealer?nic=${encodeURIComponent(nic.trim())}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      if (response.status === 400) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Invalid request')
      }
      if (response.status === 500) {
        throw new Error('Server error occurred while validating NIC')
      }
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data: ValidationResponse = await response.json()

    // Update cache if dealer found
    if (data.valid && data.dealer) {
      dealersCache.set(normalizedNIC, data.dealer)
      lastCacheUpdate = currentTime
    }

    return {
      valid: data.valid,
      dealer: data.dealer
    }

  } catch (error) {
    console.error("Error validating dealer NIC:", error)
    
    // Re-throw with more specific error messages
    if (error instanceof Error) {
      throw error
    } else {
      throw new Error("Failed to validate NIC. Please try again later.")
    }
  }
}

/**
 * Validate multiple NIC numbers at once using bulk API endpoint
 */
export async function validateMultipleDealerNICs(nics: string[]): Promise<BulkValidationResponse> {
  try {
    if (!nics || nics.length === 0) {
      throw new Error("NICs array is required")
    }

    if (nics.length > 100) {
      throw new Error("Maximum 100 NICs allowed per request")
    }

    const response = await fetch('/api/validate-dealer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ nics })
    })

    if (!response.ok) {
      if (response.status === 400) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Invalid request')
      }
      if (response.status === 500) {
        throw new Error('Server error occurred while validating NICs')
      }
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data: BulkValidationResponse = await response.json()

    // Update cache with found dealers
    const currentTime = Date.now()
    data.results.forEach(result => {
      if (result.valid && result.dealer) {
        const normalizedNIC = result.nic.trim().toUpperCase()
        dealersCache.set(normalizedNIC, result.dealer)
      }
    })
    lastCacheUpdate = currentTime

    return data

  } catch (error) {
    console.error("Error validating multiple dealer NICs:", error)
    
    if (error instanceof Error) {
      throw error
    } else {
      throw new Error("Failed to validate NICs. Please try again later.")
    }
  }
}

/**
 * Clear the local cache (useful for testing or manual cache invalidation)
 */
export function clearDealerCache(): void {
  dealersCache.clear()
  lastCacheUpdate = 0
}

/**
 * Get cache statistics (useful for debugging)
 */
export function getCacheStats(): { size: number; lastUpdate: Date | null } {
  return {
    size: dealersCache.size,
    lastUpdate: lastCacheUpdate > 0 ? new Date(lastCacheUpdate) : null
  }
}
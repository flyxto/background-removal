// API Route: /app/api/validate-dealer/route.ts
// API endpoint to validate dealer NIC numbers using MongoDB

import { NextRequest, NextResponse } from 'next/server'
import clientPromise from '@/lib/mongodb'

// Interface for dealer data
interface Dealer {
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

// Database configuration
const DB_NAME = "json_data_management"
const COLLECTION_NAME = "uploaded_data"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const nic = searchParams.get('nic')

    if (!nic) {
      return NextResponse.json(
        { error: 'NIC parameter is required' },
        { status: 400 }
      )
    }

    // Normalize the NIC by removing any spaces and converting to uppercase
    const normalizedNIC = nic.trim().toUpperCase()

    if (!normalizedNIC) {
      return NextResponse.json(
        { error: 'Invalid NIC format' },
        { status: 400 }
      )
    }

    const client = await clientPromise
    const db = client.db(DB_NAME)
    const collection = db.collection(COLLECTION_NAME)

    // Use MongoDB aggregation to search within the dealers array
    const result = await collection.aggregate([
      // Match documents that have a dealers array
      { $match: { dealers: { $exists: true } } },
      
      // Unwind the dealers array to work with individual dealer documents
      { $unwind: "$dealers" },
      
      // Match the specific NIC number (case-insensitive)
      { 
        $match: { 
          $expr: {
            $eq: [
              { $toUpper: { $trim: { input: { $toString: "$dealers.NICNUMBER" } } } },
              normalizedNIC
            ]
          }
        }
      },
      
      // Project only the dealer data
      { $project: { _id: 0, dealer: "$dealers" } },
      
      // Limit to 1 result since NIC should be unique
      { $limit: 1 }
    ]).toArray()

    if (result.length > 0 && result[0].dealer) {
      return NextResponse.json({
        valid: true,
        dealer: result[0].dealer as Dealer
      })
    } else {
      return NextResponse.json({
        valid: false,
        message: 'Dealer not found with the provided NIC number'
      })
    }

  } catch (error) {
    console.error("Error validating dealer NIC:", error)
    return NextResponse.json(
      { error: 'Internal server error while validating NIC' },
      { status: 500 }
    )
  }
}

// Optional: Add POST method for bulk validation or more complex queries
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { nics } = body

    if (!nics || !Array.isArray(nics)) {
      return NextResponse.json(
        { error: 'nics array is required' },
        { status: 400 }
      )
    }

    if (nics.length > 100) {
      return NextResponse.json(
        { error: 'Maximum 100 NICs allowed per request' },
        { status: 400 }
      )
    }

    const client = await clientPromise
    const db = client.db(DB_NAME)
    const collection = db.collection(COLLECTION_NAME)

    // Normalize all NICs
    const normalizedNICs = nics.map(nic => String(nic).trim().toUpperCase())

    // Use MongoDB aggregation to search for multiple NICs
    const results = await collection.aggregate([
      // Match documents that have a dealers array
      { $match: { dealers: { $exists: true } } },
      
      // Unwind the dealers array
      { $unwind: "$dealers" },
      
      // Match NICs that are in our list
      { 
        $match: { 
          $expr: {
            $in: [
              { $toUpper: { $trim: { input: { $toString: "$dealers.NICNUMBER" } } } },
              normalizedNICs
            ]
          }
        }
      },
      
      // Project only the dealer data
      { $project: { _id: 0, dealer: "$dealers" } }
    ]).toArray()

    // Create a map of found dealers
    const foundDealers = new Map()
    results.forEach(result => {
      const dealer = result.dealer as Dealer
      const normalizedFoundNIC = String(dealer.NICNUMBER).trim().toUpperCase()
      foundDealers.set(normalizedFoundNIC, dealer)
    })

    // Build response for all requested NICs
    const response = nics.map(nic => {
      const normalizedNIC = String(nic).trim().toUpperCase()
      const dealer = foundDealers.get(normalizedNIC)
      
      return {
        nic: nic,
        valid: !!dealer,
        dealer: dealer || null
      }
    })

    return NextResponse.json({
      results: response,
      total: nics.length,
      found: results.length
    })

  } catch (error) {
    console.error("Error in bulk NIC validation:", error)
    return NextResponse.json(
      { error: 'Internal server error while validating NICs' },
      { status: 500 }
    )
  }
}
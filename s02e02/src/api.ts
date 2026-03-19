import axios from "axios"
import { VerifyPayload, RotateResponse } from "./types"

const getApiKey = (): string => {
	const key = process.env.AI_DEVS_API_KEY
	if (!key) throw new Error("AI_DEVS_API_KEY is not set")
	return key
}

export const fetchBoardImage = async (): Promise<Buffer> => {
	const apiKey = getApiKey()
	const url = `${process.env.AI_DEVS_HUB_ENDPOINT}/data/${apiKey}/electricity.png`
	const response = await axios.get(url, { responseType: "arraybuffer" })
	return Buffer.from(response.data)
}

export const fetchTargetImage = async (): Promise<Buffer> => {
	const url = `${process.env.AI_DEVS_HUB_ENDPOINT}/i/solved_electricity.png`
	const response = await axios.get(url, { responseType: "arraybuffer" })
	return Buffer.from(response.data)
}

export const rotateTile = async (position: string): Promise<RotateResponse> => {
	const apiKey = getApiKey()
	const payload: VerifyPayload = {
		apikey: apiKey,
		task: "electricity",
		answer: { rotate: position },
	}
	const response = await axios.post(`${process.env.AI_DEVS_HUB_ENDPOINT}/verify`, payload)
	return response.data
}

export const resetBoard = async (): Promise<string> => {
	const apiKey = getApiKey()
	const url = `${process.env.AI_DEVS_HUB_ENDPOINT}/data/${apiKey}/electricity.png?reset=1`
	await axios.get(url, { responseType: "arraybuffer" })
	return "Board has been reset to initial state."
}

import { TextLoader } from 'langchain/document_loaders/fs/text'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import type { Document } from '@langchain/core/documents'
import fs from 'fs'
import path from 'path'

/**
 * 단일 Markdown 파일 로드
 */
export async function loadMarkdownFile(filePath: string): Promise<Document[]> {
  const loader = new TextLoader(filePath)
  const docs = await loader.load()

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  })

  return splitter.splitDocuments(docs)
}

/**
 * 디렉토리의 모든 .md 파일 목록 반환
 */
export function listMarkdownFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return []

  return fs
    .readdirSync(dirPath)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(dirPath, f))
}

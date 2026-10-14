import { useMutation } from '@tanstack/react-query'
import { apiUpload } from './client'

export interface UploadedContent {
  id: string
  imgproxy_url: string
}

export function useUploadImage() {
  return useMutation({
    mutationFn: (file: File) => apiUpload<UploadedContent>('/admin/api/contents/upload', file),
  })
}

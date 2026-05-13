import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAppStore = defineStore('app', () => {
  const isReady = ref(false)

  function setReady(value: boolean) {
    isReady.value = value
  }

  return { isReady, setReady }
})

import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

/** One private cache file, replaced each time; the platform grants the receiver temporary access. */
export async function shareNativeImage(blob: Blob, fileName: string, text: string): Promise<'shared' | 'cancelled' | 'failed'> {
  try {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('IMAGE_READ_FAILED'))
      reader.onload = () => resolve(String(reader.result).split(',')[1])
      reader.readAsDataURL(blob)
    })
    const { uri } = await Filesystem.writeFile({ path: fileName, directory: Directory.Cache, data })
    try {
      await Share.share({ title: 'My StudyMax plan', text, files: [uri], dialogTitle: 'Share your plan' })
      return 'shared'
    } catch (error) {
      // Plugin cancellation messages stay inside this boundary; no provider text is displayed/logged.
      const message = error instanceof Error ? error.message : ''
      return /cancel|dismiss|not completed/i.test(message) ? 'cancelled' : 'failed'
    }
  } catch {
    return 'failed'
  }
}

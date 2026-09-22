declare module '@paystack/inline-js' {
  export interface PaystackTransaction {
    reference: string
    trans?: string
    status?: string
    message?: string
    transaction?: string
  }

  export interface ResumeOptions {
    onSuccess?: (transaction: PaystackTransaction) => void
    onCancel?: () => void
    onError?: (error: { message?: string }) => void
    onLoad?: (response: unknown) => void
  }

  export default class PaystackPop {
    resumeTransaction(accessCode: string, options?: ResumeOptions): void
  }
}

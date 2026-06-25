// TODO: replace with Resend in Pass 5
export const sendEmail = async (to: string, subject: string, body: string) => {
  console.log(`[MOCK EMAIL] TO: ${to}`);
  console.log(`[MOCK EMAIL] SUBJECT: ${subject}`);
  console.log(`[MOCK EMAIL] BODY: ${body}`);
  
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  return { success: true };
};

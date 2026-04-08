import axios from 'axios';

export const contactService = {
  /**
   * Forwards contact form data to Google Apps Script
   */
  submitToGoogle: async (formData: any) => {
    const scriptUrl = process.env.GOOGLE_SCRIPT_URL;
    
    if (!scriptUrl) {
      throw new Error('GOOGLE_SCRIPT_URL is not configured in .env');
    }

    const response = await axios.post(scriptUrl, formData, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return response.data;
  },
};

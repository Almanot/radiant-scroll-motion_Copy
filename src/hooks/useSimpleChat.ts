
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
}

export const useSimpleChat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addMessage = useCallback((content: string, role: 'user' | 'assistant') => {
    const newMessage: Message = {
      id: `${role}-${Date.now()}-${Math.random().toString(36).substring(2)}`,
      content,
      role,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, newMessage]);
    return newMessage.id;
  }, []);

  const sendMessage = useCallback(async (message: string, chatId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      console.log('📤 Отправка сообщения на n8n:', { message, chat_id: chatId });

      // Отправляем на n8n webhook с новым форматом тела
      const response = await fetch('https://n8n.srv838454.hstgr.cloud/webhook/84ac1eaf-efe6-4517-bc28-5b239286b274', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          message: message
        })
      });

      if (!response.ok) {
        throw new Error(`N8N webhook error: ${response.status}`);
      }

      console.log('✅ Сообщение отправлено на n8n');

      // Начинаем опрос ответа
      const maxAttempts = 24; // 2 минуты (24 * 5 секунд)
      let attempts = 0;

      const pollForResponse = async (): Promise<string | null> => {
        while (attempts < maxAttempts) {
          attempts++;
          
          try {
            console.log(`🔄 Попытка ${attempts}/${maxAttempts} получить ответ`);
            
            const { data, error } = await supabase.functions.invoke('n8n-webhook', {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ chatId })
            });

            if (error) {
              console.log('❌ Ошибка при получении ответа:', error);
              await new Promise(resolve => setTimeout(resolve, 5000));
              continue;
            }

            if (data?.success && data?.message) {
              console.log('✅ Получен ответ от n8n');
              return data.message;
            }

            // Ждем 5 секунд перед следующей попыткой
            await new Promise(resolve => setTimeout(resolve, 5000));
          } catch (err) {
            console.log('❌ Ошибка опроса:', err);
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }

        return null;
      };

      const aiResponse = await pollForResponse();

      if (aiResponse) {
        addMessage(aiResponse, 'assistant');
      } else {
        throw new Error('Не удалось получить ответ от AI в течение 2 минут');
      }

    } catch (err) {
      console.error('💥 Ошибка отправки сообщения:', err);
      const errorMessage = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(errorMessage);
      
      // Добавляем сообщение об ошибке
      addMessage(`Извините, произошла ошибка: ${errorMessage}`, 'assistant');
    } finally {
      setIsLoading(false);
    }
  }, [addMessage]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    addMessage,
    clearMessages,
    clearError: () => setError(null)
  };
};

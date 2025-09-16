'use client';

import { GradientButton } from '@/components/component/Button';
import { cn } from '@/lib/utils';
import { Check, ChevronRight, Copy, Edit, Save, X } from 'lucide-react';
import { ChangeEvent, useEffect, useState } from 'react';
import copy from 'clipboard-copy';
import { Configuration } from '@/lib/types';
import { useStateContext } from '@/provider/StateProvider';

const Page = () => {
  const [password, setPassword] = useState<string>('');
  const [isPassed, setIsPassed] = useState<boolean>(false);
  const [isEdit, setIsEdit] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [adminData, setAdminData] = useState<Configuration>({
    pubKey: '',
  });
  const [prev, setPrev] = useState<{ key: keyof Configuration; value: string | number }>({
    key: 'pubKey',
    value: '',
  });

  const [isCopied, setIsCopied] = useState('');

  const { setConfigData, setLoading } = useStateContext();

  useEffect(() => {
    const fetchPublicKey = async () => {
      setLoading(true); // Start loading
      try {
        const response = await fetch('/api/admin', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          // Handle HTTP errors (e.g., 404, 500)
          throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();

        if (data && data.pubKey) {
          console.log('Received pubKey:', data.pubKey); // Log what you received
          setConfigData(data);
        } else {
          // Handle cases where the response isn't what you expect
          throw new Error('Invalid response format from /api/admin');
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        console.error('Error fetching public key:', err);
      } finally {
        setLoading(false); // Stop loading, regardless of success/failure
      }
    };

    fetchPublicKey();
  }, [setConfigData, setLoading]);

  async function handleCopyClick(name: string, text: string) {
    try {
      await copy(text);
      setIsCopied(name);
      setTimeout(() => {
        setIsCopied('');
      }, 1000); // Reset "Copied!" state after 2 seconds
    } catch (error) {
      console.error('Failed to copy text to clipboard', error);
    }
  }

  async function handleSubmit() {
    if (password.trim() === '') {
      return;
    }
    try {
      setIsLoading(true);
      const response = await fetch('/api/auth/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      setIsPassed(data.success);
      if (data.success) {
        console.log(data.publicKey);
        setAdminData({
          pubKey: data.pubKey,
        });
      }
      setIsLoading(false);
    } catch (error) {
      console.error(error);
      setIsLoading(false);
    }
  }

  function handleEdit(text: keyof Configuration) {
    if (isEdit === text) {
      setIsEdit('');
    } else {
      setIsEdit(text);
      setPrev({ key: text, value: adminData[text] || '' });
    }
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    setAdminData({ ...adminData, [e.target.name]: e.target.value });
  }

  async function handleUpdateAdminData() {
    if (adminData[prev.key] === prev.value) {
      setIsEdit('');
      return;
    }
    const response = await fetch('/api/admin/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(adminData),
    });
    const data = await response.json();
    console.log(data);
    setAdminData({
      pubKey: data.pubKey,
    });
    setIsEdit('');
  }

  return (
    <section className='text-text-secondary min-h-[calc(100vh-300px)] flex justify-center items-center flex-col gap-4 md:gap-8 pt-[78px] md:pt-[93px]'>
      <h2
        className={cn(
          'text-center text-transparent text-3xl md:text-5xl mt-4 md:mt-6 font-medium',
          'bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text'
        )}
      >
        Admin Page
      </h2>
      {isPassed ? (
        <div className='flex flex-col justify-center items-center w-full px-4 md:px-8'>
          {/* Public Key */}
          <div className='flex gap-4 md:gap-8 items-center justify-between border w-full max-w-full py-2 px-4 md:px-8 overflow-hidden'>
            <p className='text-xs md:text-base whitespace-nowrap md:w-20 w-16'>Public Key</p>
            <div className='flex items-center justify-center gap-2 py-1 md:gap-4 w-full text-left text-xs md:text-base max-w-[65%] overflow-x-auto no-scrollbar'>
              {isEdit === 'pubKey' ? (
                <input
                  className='text-gray-700 px-2 outline-none py-1 rounded-sm w-full'
                  name='pubKey'
                  value={adminData.pubKey || ''}
                  onChange={handleChange}
                />
              ) : (
                <p className='py-1 text-xs md:text-base'>{adminData.pubKey}</p>
              )}
            </div>
            <div className='flex gap-2'>
              <button className='hover:text-text-secondary transition-colors'>
                {isEdit === 'pubKey' ? (
                  <X onClick={() => setIsEdit('')} />
                ) : isCopied === 'pubKey' ? (
                  <Check />
                ) : (
                  <Copy onClick={() => handleCopyClick('pubKey', adminData.pubKey || '')} />
                )}
              </button>
              <button className='hover:text-text-secondary transition-colors'>
                {isEdit === 'pubKey' ? (
                  <Save onClick={handleUpdateAdminData} />
                ) : (
                  <Edit onClick={() => handleEdit('pubKey')} />
                )}
              </button>
            </div>
          </div>






        </div>
      ) : (
        <div className='flex items-center justify-center gap-4 md:gap-8 text-gray-800'>
          <input
            name='password'
            type='password'
            placeholder='Admin Password'
            className='h-12 rounded-xl px-3 py-0.5'
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                handleSubmit();
              }
            }}
          />

          <GradientButton disabled={isLoading} className='w-36 py-2' onClick={handleSubmit}>
            Submit
            {!isLoading ? (
              <ChevronRight />
            ) : (
              <div className='animate-spin w-4 h-4 bg-transparent rounded-full border-white border-t-4' />
            )}
          </GradientButton>
        </div>
      )}
    </section>
  );
};

export default Page;

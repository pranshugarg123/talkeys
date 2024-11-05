import React from 'react';
import Link from 'next/link';
import Head from 'next/head';
import Navbar from '@/components/Navbar';
import image from "../../public/images/Default.png"

const SignUpPage = () => {
  return (
    <>
      <div
        className="min-h-screen text-white"
        style={{
            backgroundImage: `url(${image.src})`,
            backgroundSize: 'cover',
            backgroundRepeat: 'no-repeat',
        }}
      >
        <Navbar />

        {/* Main Content */}
        <div className="flex justify-center items-center min-h-[calc(100vh-80px)]">
          <div className="relative w-full max-w-6xl px-4">

            {/* Signup Card */}
            <div className="relative bg-[#202020] bg-opacity-80 rounded-2xl p-8 max-w-md mx-auto">
              <div className="text-center mb-10">
                <h2 className="text-2xl font-bold mb-2">Sign Up Now</h2>
                <p className="text-gray-400">Get Started Today!</p>
              </div>

              <div className="space-y-4">
                <button className="w-full py-3 px-4 border border-gray-600 rounded-lg flex items-center justify-center space-x-2 hover:bg-gray-800 transition-colors">
                  <span>Continue with Google</span>
                </button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-600"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-gray-900 text-gray-400">or</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Enter your name</label>
                  <input
                    type="text"
                    placeholder="Your username here"
                    className="w-full px-4 py-3 bg-black border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                <button className="w-full py-3 bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors">
                  Continue with Email
                </button>

                <p className="text-sm text-gray-400 text-center">
                  By continuing you agree to our{' '}
                  <Link href="http://localhost:3001/terms" className="text-purple-400 hover:text-purple-300">
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link href="http://localhost:3001/privacy" className="text-purple-400 hover:text-purple-300">
                    Privacy Policy
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default SignUpPage;
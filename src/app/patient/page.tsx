'use client';

import React from 'react';
import Link from 'next/link';
import { Heart, Shield, Calendar, MessageSquare, Users, ArrowRight, CheckCircle, FileText } from 'lucide-react';

export default function PatientPortalLanding() {
  const features = [
    {
      icon: Users,
      title: 'Care Team',
      description: 'Stay connected with your assigned caregivers and healthcare providers',
    },
    {
      icon: FileText,
      title: 'Forms & Documents',
      description: 'Complete required forms and access your medical documents securely',
    },
    {
      icon: Calendar,
      title: 'Visit Scheduling',
      description: 'View your care schedule and upcoming visits at a glance',
    },
    {
      icon: MessageSquare,
      title: 'Secure Messaging',
      description: 'Send messages and updates to your care team directly',
    },
    {
      icon: Shield,
      title: 'Privacy & Security',
      description: 'Your health information is encrypted and fully protected',
    },
    {
      icon: Heart,
      title: 'Health Tracking',
      description: 'Monitor your care plan and health goals together with your team',
    },
  ];

  const benefits = [
    'Easy-to-use platform designed for all ages',
    'Real-time communication with your care team',
    'Secure document management',
    'Accessible from any device',
    'Family-friendly features for loved ones',
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Heart className="w-8 h-8 text-blue-600" />
            <span className="text-xl font-bold text-gray-900">KodaConnect</span>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full ml-2">Patient Portal</span>
          </div>
          <nav className="hidden sm:flex gap-6">
            <a href="#features" className="text-gray-600 hover:text-gray-900 transition">Features</a>
            <a href="#benefits" className="text-gray-600 hover:text-gray-900 transition">Benefits</a>
            <a href="#contact" className="text-gray-600 hover:text-gray-900 transition">Contact</a>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
        <div className="text-center space-y-6">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight">
            Your Care Journey,
            <span className="block text-blue-600">Simplified</span>
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Access your care team, complete forms, view your schedule, and communicate securely—all in one place.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Link
              href="/patient/login"
              className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white font-semibold px-8 py-3 rounded-lg hover:bg-blue-700 transition shadow-md"
              aria-label="Sign in to your patient account"
            >
              Sign In
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/patient/register"
              className="inline-flex items-center justify-center gap-2 border-2 border-blue-600 text-blue-600 font-semibold px-8 py-3 rounded-lg hover:bg-blue-50 transition"
              aria-label="Create a new patient account"
            >
              Register
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="bg-white py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">What You Can Do</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <div
                  key={idx}
                  className="p-6 border border-gray-200 rounded-lg hover:shadow-lg transition space-y-3"
                >
                  <Icon className="w-8 h-8 text-blue-600" aria-hidden="true" />
                  <h3 className="font-semibold text-gray-900">{feature.title}</h3>
                  <p className="text-gray-600 text-sm">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section id="benefits" className="py-16 sm:py-24 bg-blue-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">Why KodaConnect</h2>
          <div className="bg-white rounded-lg p-8 sm:p-12 border border-blue-200">
            <ul className="space-y-4">
              {benefits.map((benefit, idx) => (
                <li key={idx} className="flex items-start gap-4">
                  <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="text-gray-700 text-lg">{benefit}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 sm:py-24 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">Questions?</h2>
          <div className="space-y-6">
            <details className="border border-gray-200 rounded-lg p-6 cursor-pointer group">
              <summary className="font-semibold text-gray-900 flex items-center justify-between select-none">
                Is my information secure?
                <span className="text-gray-400 group-open:rotate-180 transition">▾</span>
              </summary>
              <p className="text-gray-600 mt-4">
                Yes. Your health information is protected with industry-standard encryption (HIPAA compliant) and secure login authentication.
              </p>
            </details>
            <details className="border border-gray-200 rounded-lg p-6 cursor-pointer group">
              <summary className="font-semibold text-gray-900 flex items-center justify-between select-none">
                Do I need special software?
                <span className="text-gray-400 group-open:rotate-180 transition">▾</span>
              </summary>
              <p className="text-gray-600 mt-4">
                No. KodaConnect works on any device with a web browser. Use it on your phone, tablet, or computer.
              </p>
            </details>
            <details className="border border-gray-200 rounded-lg p-6 cursor-pointer group">
              <summary className="font-semibold text-gray-900 flex items-center justify-between select-none">
                Can my family help me?
                <span className="text-gray-400 group-open:rotate-180 transition">▾</span>
              </summary>
              <p className="text-gray-600 mt-4">
                Yes. You can add family members or caregivers to help you access forms and stay updated on your care plan.
              </p>
            </details>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 sm:py-24 bg-gradient-to-r from-blue-600 to-blue-700">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
          <h2 className="text-3xl font-bold text-white">Ready to Get Started?</h2>
          <p className="text-blue-100 text-lg">Create your account or sign in to access your care team.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Link
              href="/patient/login"
              className="inline-flex items-center justify-center bg-white text-blue-600 font-semibold px-8 py-3 rounded-lg hover:bg-blue-50 transition"
            >
              Sign In
            </Link>
            <Link
              href="/patient/register"
              className="inline-flex items-center justify-center border-2 border-white text-white font-semibold px-8 py-3 rounded-lg hover:bg-blue-600 transition"
            >
              Create Account
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer id="contact" className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <div>
              <h3 className="text-white font-semibold mb-4">KodaConnect</h3>
              <p className="text-sm">Healthcare communication platform for better patient engagement.</p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Quick Links</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/patient/login" className="hover:text-white transition">Sign In</Link></li>
                <li><Link href="/patient/register" className="hover:text-white transition">Register</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Support</h4>
              <p className="text-sm">Need help? Contact your care provider for access details.</p>
            </div>
          </div>
          <div className="border-t border-gray-700 pt-8 text-sm text-center">
            <p>&copy; 2024 KodaConnect. All rights reserved. HIPAA Compliant.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

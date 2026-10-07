import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Layout from './components/Layout'
import Home from './pages/Home'
import Services from './pages/Services'
import ServiceDetail from './pages/ServiceDetail'
import Start from './pages/Start'
import Contact from './pages/Contact'
import Projects from './pages/Projects'
import About from './pages/About'
import AdminLayout from './pages/admin/AdminLayout'
import Login from './pages/admin/Login'
import Inquiries from './pages/admin/Inquiries'
import AdminServices from './pages/admin/AdminServices'
import { InsightsList, InsightPost } from './pages/Insights'
import ClientConversation from './pages/ClientConversation'
import ContentEditor from './pages/admin/ContentEditor'
import './index.css'
createRoot(document.getElementById('root')!).render(
  <React.StrictMode><QueryClientProvider client={new QueryClient()}><BrowserRouter><Routes>
    <Route element={<Layout/>}><Route index element={<Home/>}/><Route path="services" element={<Services/>}/><Route path="services/:slug" element={<ServiceDetail/>}/><Route path="start" element={<Start/>}/><Route path="contact" element={<Contact/>}/><Route path="projects" element={<Projects/>}/><Route path="about" element={<About/>}/><Route path="insights" element={<InsightsList/>}/><Route path="insights/:slug" element={<InsightPost/>}/><Route path="c/:token" element={<ClientConversation/>}/><Route path="admin/login" element={<Login/>}/></Route>
    <Route path="admin" element={<AdminLayout/>}><Route index element={<Inquiries/>}/><Route path="services" element={<AdminServices/>}/><Route path="content/:table" element={<ContentEditor/>}/></Route>
  </Routes></BrowserRouter></QueryClientProvider></React.StrictMode>)

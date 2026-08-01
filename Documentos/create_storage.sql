-- 1. Tenta criar o Bucket 'logos', mas se já existir, ele ignora e segue em frente
INSERT INTO storage.buckets (id, name, public) 
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Permite que qualquer pessoa (clientes, etc) veja a foto do salão
CREATE POLICY "Public Access to logos" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'logos');

-- 3. Permite que usuários logados façam o upload de novas fotos
CREATE POLICY "Authenticated users can upload logos" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (bucket_id = 'logos');

-- 4. Permite que usuários logados atualizem fotos já existentes
CREATE POLICY "Authenticated users can update logos" 
ON storage.objects FOR UPDATE 
TO authenticated 
USING (bucket_id = 'logos');

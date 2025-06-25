variable "db_host" {
  description = "MongoDB connection string"
  type        = string
  sensitive   = true
}
variable "aws_region" {
  default = "ap-southeast-2"
}
